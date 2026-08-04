/**
 * 上下文颜色的识别、原因分类与安全降级。
 *
 * 原则: 缺少文档、元素、主题、变量或设备上下文时, 一律返回 `contextual`,
 * 绝不猜测成具体颜色 (旧插件把 `currentColor` 之类当成黑色是明确要避免的行为)。
 */
import { buildResolved } from './colorjs-bridge.js';
import {
  functionName,
  splitFunctionArguments,
  type ComponentValue,
} from './csstools-bridge.js';
import {
  lookupDeprecatedSystemColor,
  lookupNamedColor,
  lookupSystemColor,
} from './keywords.js';
import type {
  AssumedContext,
  ContextualBranch,
  ContextualColor,
  ContextualReason,
  ResolvedColor,
} from './types.js';

export interface ContextualPreviewOptions {
  /** `off` 时不生成假设预览。 */
  readonly contextualPreview: 'off' | 'light' | 'dark';
  /** `hdr-color()` 的假设 headroom, 0 表示不预览。 */
  readonly hdrAssumedHeadroom: number;
}

function namedToResolved(name: string): ResolvedColor | undefined {
  const rgb = lookupNamedColor(name);
  if (!rgb) return undefined;
  return buildResolved({
    cssSpace: 'srgb',
    channels: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255],
    alpha: 1,
  });
}

function makeContextual(
  reason: ContextualReason,
  dependsOn: string,
  branches: ContextualBranch[] = [],
  replacement?: string,
): ContextualColor {
  return { reason, dependsOn, branches, replacement };
}

/** `currentColor` 依赖继承的 `color` 属性。 */
export function classifyCurrentColor(): ContextualColor {
  return makeContextual('current-color', 'currentColor');
}

/** 当前系统色。 */
export function classifySystemColor(ident: string): ContextualColor | undefined {
  const canonical = lookupSystemColor(ident);
  if (!canonical) return undefined;
  return makeContextual('system-color', canonical);
}

/** Deprecated 系统色, 附带替代关键字。 */
export function classifyDeprecatedSystemColor(ident: string): ContextualColor | undefined {
  const found = lookupDeprecatedSystemColor(ident);
  if (!found) return undefined;
  return makeContextual('deprecated-system-color', found.canonical, [], found.replacement);
}

export interface LightDarkParseResult {
  readonly contextual: ContextualColor;
}

/**
 * `light-dark(<color>, <color>)`。
 * 两个分支都静态可解析时作为候选分支返回; 是否采用假设预览由调用方按配置决定。
 */
export function classifyLightDark(
  node: ComponentValue,
  resolveBranch: (group: readonly ComponentValue[]) => ResolvedColor | undefined,
  options: ContextualPreviewOptions,
): LightDarkParseResult | undefined {
  if (functionName(node) !== 'light-dark') return undefined;
  const args = splitFunctionArguments(node);
  if (args.groups.length !== 2) return undefined;

  const lightResolved = resolveBranch(args.groups[0]);
  const darkResolved = resolveBranch(args.groups[1]);

  const branches: ContextualBranch[] = [
    { label: 'light', raw: groupText(args.groups[0]), resolved: lightResolved },
    { label: 'dark', raw: groupText(args.groups[1]), resolved: darkResolved },
  ];

  const assumedBranch =
    options.contextualPreview === 'light'
      ? lightResolved
      : options.contextualPreview === 'dark'
        ? darkResolved
        : undefined;

  const contextual: ContextualColor = {
    reason: 'color-scheme',
    dependsOn: 'color-scheme',
    branches,
    assumed:
      assumedBranch && options.contextualPreview !== 'off'
        ? {
            context: options.contextualPreview as AssumedContext,
            resolved: assumedBranch,
          }
        : undefined,
  };
  return { contextual };
}

function groupText(group: readonly ComponentValue[]): string {
  return group.map((node) => node.toString()).join('').trim();
}

/** `color(--profile ...)`: 有 `fallback` 描述符时可解析, 否则 contextual。 */
export function classifyCustomColorProfile(
  profileName: string,
  fallback: ResolvedColor | undefined,
): ContextualColor {
  const branches: ContextualBranch[] = fallback
    ? [{ label: 'fallback', raw: profileName, resolved: fallback }]
    : [];
  return makeContextual('custom-color-profile', profileName, branches);
}

/** `hdr-color()`: headroom 属于设备上下文。 */
export function classifyHdrHeadroom(
  raw: string,
  branches: ContextualBranch[],
  options: ContextualPreviewOptions,
): ContextualColor {
  const assumed =
    options.hdrAssumedHeadroom > 0 && branches.length > 0 && branches[0].resolved
      ? { context: 'hdr-headroom' as AssumedContext, resolved: branches[0].resolved }
      : undefined;
  return { reason: 'hdr-headroom', dependsOn: raw, branches, assumed };
}

/** CSS 自定义属性无法唯一确定时。 */
export function classifyCssVariable(name: string, branches: ContextualBranch[] = []): ContextualColor {
  return makeContextual('css-variable', name, branches);
}

/** 预处理器变量无法唯一确定时。 */
export function classifyPreprocessorVariable(
  name: string,
  branches: ContextualBranch[] = [],
): ContextualColor {
  return makeContextual('preprocessor-variable', name, branches);
}

/** 实验语法关闭, 或草案语义未定。 */
export function classifyUnsupportedExperimental(dependsOn: string): ContextualColor {
  return makeContextual('unsupported-experimental-context', dependsOn);
}

export { namedToResolved };
