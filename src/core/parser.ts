/**
 * 单个颜色表达式的解析入口。
 *
 * 分派顺序:
 * 1. 上下文关键字 (`currentColor`、系统色、deprecated 系统色);
 * 2. CSSTools (Color 4 全部 + 可静态求值的 Color 5);
 * 3. 自有解析器 (`device-cmyk()`、`light-dark()`、`color(--profile ...)`、Color 6、HDR);
 * 4. 都不认识则返回 `invalid` 并附结构化 diagnostic。
 *
 * 这里不做扫描与定位, 只对已经切好的 component value 求值。
 */
import { buildResolved } from './colorjs-bridge.js';
import {
  classifyCurrentColor,
  classifyCustomColorProfile,
  classifyDeprecatedSystemColor,
  classifyHdrHeadroom,
  classifyLightDark,
  classifySystemColor,
  classifyUnsupportedExperimental,
  type ContextualPreviewOptions,
} from './contextual.js';
import {
  functionName,
  isFunctionNode,
  isTokenNode,
  parseSingleComponentValue,
  parseWithCssTools,
  readAlpha,
  readChannel,
  readIdent,
  readNumeric,
  splitFunctionArguments,
  type ComponentValue,
} from './csstools-bridge.js';
import { parseDeviceCmyk } from './device-cmyk.js';
import { compositeLayers, parseBaseRoleKeyword, parseTargetContrast, selectContrastColor } from './experimental-color6.js';
import { isHdrSourceSpace, parseHdrFunction } from './experimental-hdr.js';
import {
  isCustomColorSpace,
  isExperimentalFunction,
  isHdrSpace,
  lookupNamedColor,
  TRANSPARENT_KEYWORD,
} from './keywords.js';
import type {
  ColorDiagnostic,
  ContextualColor,
  ResolutionKind,
  ResolvedColor,
  SpecLevel,
} from './types.js';
import { createDiagnostic } from './types.js';

export interface ParseOptions extends ContextualPreviewOptions {
  readonly cssColor6: boolean;
  readonly cssColorHdr: boolean;
  /** `@color-profile` 名称 → fallback 颜色, 由 adapters 收集。 */
  readonly colorProfileFallbacks?: ReadonlyMap<string, ResolvedColor>;
}

export interface ParsedColor {
  readonly resolution: ResolutionKind;
  readonly syntax: string;
  readonly specLevel: SpecLevel;
  readonly experimental: boolean;
  readonly sourceSpace?: string;
  readonly resolved?: ResolvedColor;
  readonly contextual?: ContextualColor;
  readonly diagnostics: readonly ColorDiagnostic[];
}

function invalid(
  syntax: string,
  diagnostics: readonly ColorDiagnostic[],
  specLevel: SpecLevel = 'color-4',
): ParsedColor {
  return { resolution: 'invalid', syntax, specLevel, experimental: false, diagnostics };
}

function contextualResult(
  syntax: string,
  contextual: ContextualColor,
  specLevel: SpecLevel,
  experimental = false,
  diagnostics: readonly ColorDiagnostic[] = [],
): ParsedColor {
  return { resolution: 'contextual', syntax, specLevel, experimental, contextual, diagnostics };
}

function resolvedResult(
  syntax: string,
  resolved: ResolvedColor,
  specLevel: SpecLevel,
  experimental = false,
  diagnostics: readonly ColorDiagnostic[] = [],
): ParsedColor {
  return {
    resolution: 'resolved',
    syntax,
    specLevel,
    experimental,
    sourceSpace: resolved.originalSpace,
    resolved,
    diagnostics,
  };
}

function identOf(node: ComponentValue): string | undefined {
  if (!isTokenNode(node)) return undefined;
  const numeric = readNumeric(node);
  return numeric.kind === 'ident' ? numeric.ident : undefined;
}

/** 裸标识符: 命名颜色、`transparent`、`currentColor`、系统色。 */
function parseIdentifier(ident: string): ParsedColor | undefined {
  const lower = ident.toLowerCase();

  if (lower === TRANSPARENT_KEYWORD) {
    return resolvedResult(
      'transparent',
      buildResolved({ cssSpace: 'srgb', channels: [0, 0, 0], alpha: 0 }),
      'color-4',
    );
  }

  const named = lookupNamedColor(ident);
  if (named) {
    return resolvedResult(
      'named-color',
      buildResolved({
        cssSpace: 'srgb',
        channels: [named[0] / 255, named[1] / 255, named[2] / 255],
        alpha: 1,
      }),
      'color-4',
    );
  }

  if (lower === 'currentcolor') {
    return contextualResult('current-color', classifyCurrentColor(), 'color-4');
  }

  const system = classifySystemColor(ident);
  if (system) return contextualResult('system-color', system, 'color-4');

  const deprecated = classifyDeprecatedSystemColor(ident);
  if (deprecated) {
    return contextualResult('deprecated-system-color', deprecated, 'color-4', false, [
      createDiagnostic('unknown-function', 'info', 'diagnostic.deprecatedSystemColor', [
        deprecated.dependsOn,
        deprecated.replacement ?? '',
      ]),
    ]);
  }

  return undefined;
}

/** `color(--profile ...)` 与 `color(rec2100-* ...)`。 */
function parseColorFunctionExtensions(
  node: ComponentValue,
  options: ParseOptions,
): ParsedColor | undefined {
  const args = splitFunctionArguments(node);
  const spaceIdent = readIdent(args.groups[0]);
  if (!spaceIdent) return undefined;

  if (isCustomColorSpace(spaceIdent)) {
    const fallback = options.colorProfileFallbacks?.get(spaceIdent);
    const contextual = classifyCustomColorProfile(spaceIdent, fallback);
    if (fallback) {
      return {
        resolution: 'resolved',
        syntax: 'color-custom-profile',
        specLevel: 'color-5',
        experimental: false,
        sourceSpace: fallback.originalSpace,
        resolved: fallback,
        diagnostics: [
          createDiagnostic('upstream-unsupported', 'info', 'diagnostic.customProfileFallback', [spaceIdent]),
        ],
      };
    }
    return contextualResult('color-custom-profile', contextual, 'color-5');
  }

  if (isHdrSpace(spaceIdent)) {
    if (!options.cssColorHdr) {
      return contextualResult(
        `color-${spaceIdent.toLowerCase()}`,
        classifyUnsupportedExperimental(spaceIdent),
        'color-hdr-1',
        true,
        [createDiagnostic('experimental-disabled', 'info', 'diagnostic.experimentalDisabledHdr', [spaceIdent])],
      );
    }
    const channels = args.groups.slice(1).map((group) => readChannel(group, 1));
    if (channels.length !== 3 || channels.some((value) => value === undefined)) {
      return invalid(`color-${spaceIdent.toLowerCase()}`, [
        createDiagnostic('invalid-component-count', 'error', 'diagnostic.invalidComponentCount', [spaceIdent]),
      ], 'color-hdr-1');
    }
    const alpha = readAlpha(args.alpha);
    if (alpha === undefined) {
      return invalid(`color-${spaceIdent.toLowerCase()}`, [
        createDiagnostic('parse-failed', 'error', 'diagnostic.invalidAlpha'),
      ], 'color-hdr-1');
    }
    const resolved = buildResolved({
      cssSpace: spaceIdent.toLowerCase(),
      channels: channels as number[],
      alpha: Number.isNaN(alpha) ? 0 : alpha,
    });
    return resolvedResult(`color-${spaceIdent.toLowerCase()}`, resolved, 'color-hdr-1', true);
  }

  return undefined;
}

/** Color 6 的 `contrast-color()` 扩展形式与 `color-layers()`。 */
function parseColor6(node: ComponentValue, options: ParseOptions): ParsedColor | undefined {
  const name = functionName(node);
  if (!name) return undefined;

  if (name === 'color-layers') {
    if (!options.cssColor6) {
      return contextualResult('color-layers', classifyUnsupportedExperimental(name), 'color-6', true, [
        createDiagnostic('experimental-disabled', 'info', 'diagnostic.experimentalDisabledColor6', [name]),
      ]);
    }
    const args = splitFunctionArguments(node);
    const layers: ResolvedColor[] = [];
    let blendMode: string | undefined;
    for (const group of flattenItems(args.groups)) {
      const ident = readIdent(group);
      if (ident && !lookupNamedColor(ident) && ident.toLowerCase() !== 'transparent') {
        blendMode = ident;
        continue;
      }
      const parsed = parseGroup(group, options);
      if (parsed?.resolved) layers.push(parsed.resolved);
    }
    const composed = compositeLayers(layers, blendMode);
    if (!composed) {
      return invalid('color-layers', [
        createDiagnostic('parse-failed', 'error', 'diagnostic.colorLayersEmpty'),
      ], 'color-6');
    }
    return resolvedResult('color-layers', composed.resolved, 'color-6', true, composed.diagnostics);
  }

  if (name === 'contrast-color') {
    const args = splitFunctionArguments(node);
    const items = flattenItems(args.groups);
    // 只有出现 Color 6 专属关键字时才走本分支; 基本形式仍交给 CSSTools。
    const hasColor6Syntax = items.some(
      (item) => parseTargetContrast(item) !== undefined || parseBaseRoleKeyword(item) !== undefined,
    );
    if (!hasColor6Syntax) return undefined;
    if (!options.cssColor6) {
      return contextualResult('contrast-color-ext', classifyUnsupportedExperimental(name), 'color-6', true, [
        createDiagnostic('experimental-disabled', 'info', 'diagnostic.experimentalDisabledColor6', [name]),
      ]);
    }

    let base: ResolvedColor | undefined;
    const candidates: ResolvedColor[] = [];
    let target: ReturnType<typeof parseTargetContrast>;
    const diagnostics: ColorDiagnostic[] = [];

    for (const group of items) {
      const parsedTarget = parseTargetContrast(group);
      if (parsedTarget) {
        target = parsedTarget;
        continue;
      }
      const role = parseBaseRoleKeyword(group);
      if (role) {
        diagnostics.push(
          createDiagnostic('upstream-unsupported', 'info', 'diagnostic.color6BaseRoleUndefined', [role]),
        );
        continue;
      }
      const parsed = parseGroup(group, options);
      if (!parsed?.resolved) continue;
      if (!base) base = parsed.resolved;
      else candidates.push(parsed.resolved);
    }

    if (!base) {
      return invalid('contrast-color-ext', [
        createDiagnostic('parse-failed', 'error', 'diagnostic.contrastColorNoBase'),
      ], 'color-6');
    }
    const pool = candidates.length > 0 ? candidates : [whiteResolved(), blackResolved()];
    const selected = selectContrastColor(base, pool, target);
    if (!selected) {
      return invalid('contrast-color-ext', [
        createDiagnostic('parse-failed', 'error', 'diagnostic.contrastColorNoCandidate'),
      ], 'color-6');
    }
    if (target && !selected.meetsTarget) {
      diagnostics.push(
        createDiagnostic('out-of-range-component', 'warning', 'diagnostic.contrastTargetUnmet', [
          target.level,
          Number(selected.ratio.toFixed(2)),
        ]),
      );
    }
    return resolvedResult('contrast-color-ext', selected.chosen, 'color-6', true, diagnostics);
  }

  return undefined;
}

function whiteResolved(): ResolvedColor {
  return buildResolved({ cssSpace: 'srgb', channels: [1, 1, 1], alpha: 1 });
}

function blackResolved(): ResolvedColor {
  return buildResolved({ cssSpace: 'srgb', channels: [0, 0, 0], alpha: 1 });
}

/**
 * 把实参拆成"单节点条目"。
 *
 * 必要性: `contrast-color(white wcag2, black)` 同时使用逗号与空白分隔,
 * 按逗号切出的第一组里含两个节点, 直接当成一个值会解析失败。
 */
function flattenItems(
  groups: readonly (readonly ComponentValue[])[],
): (readonly ComponentValue[])[] {
  const items: (readonly ComponentValue[])[] = [];
  for (const group of groups) {
    for (const node of group) items.push([node]);
  }
  return items;
}

/** 解析一组 component value (用于函数实参内部的嵌套颜色)。 */
function parseGroup(group: readonly ComponentValue[], options: ParseOptions): ParsedColor | undefined {
  if (group.length !== 1) return undefined;
  return parseComponentValueColor(group[0], options);
}

/** 主入口: 解析单个 component value。 */
export function parseComponentValueColor(
  node: ComponentValue,
  options: ParseOptions,
): ParsedColor {
  const ident = identOf(node);
  if (ident) {
    const byIdent = parseIdentifier(ident);
    if (byIdent) return byIdent;
  }

  if (isFunctionNode(node)) {
    const name = functionName(node) ?? '';

    // 实验语法在开关关闭时不进入解析, 只产生一条 info diagnostic。
    if (isExperimentalFunction(name)) {
      const isHdr = name !== 'color-layers';
      const enabled = isHdr ? options.cssColorHdr : options.cssColor6;
      if (!enabled) {
        return contextualResult(
          name,
          classifyUnsupportedExperimental(name),
          isHdr ? 'color-hdr-1' : 'color-6',
          true,
          [
            createDiagnostic(
              'experimental-disabled',
              'info',
              isHdr ? 'diagnostic.experimentalDisabledHdr' : 'diagnostic.experimentalDisabledColor6',
              [name],
            ),
          ],
        );
      }
    }

    if (name === 'light-dark') {
      const lightDark = classifyLightDark(
        node,
        (group) => parseGroup(group, options)?.resolved,
        options,
      );
      if (lightDark) {
        return contextualResult('light-dark', lightDark.contextual, 'color-5');
      }
      return invalid('light-dark', [
        createDiagnostic('invalid-component-count', 'error', 'diagnostic.lightDarkArity'),
      ], 'color-5');
    }

    if (name === 'device-cmyk') {
      const cmyk = parseDeviceCmyk(node);
      if (cmyk) {
        return resolvedResult('device-cmyk', cmyk.resolved, 'color-5', false, [
          createDiagnostic('upstream-unsupported', 'info', 'diagnostic.deviceCmykNaive'),
        ]);
      }
      return invalid('device-cmyk', [
        createDiagnostic('invalid-component-count', 'error', 'diagnostic.deviceCmykArity'),
      ], 'color-5');
    }

    const hdr = options.cssColorHdr ? parseHdrFunction(node) : undefined;
    if (hdr) {
      if (hdr.headroomDependent) {
        const contextual = classifyHdrHeadroom(node.toString(), [], options);
        return contextualResult(hdr.syntax, contextual, 'color-hdr-1', true, hdr.diagnostics);
      }
      if (hdr.resolved) {
        return resolvedResult(hdr.syntax, hdr.resolved, 'color-hdr-1', true, hdr.diagnostics);
      }
      return contextualResult(
        hdr.syntax,
        classifyUnsupportedExperimental(hdr.usedName),
        'color-hdr-1',
        true,
        hdr.diagnostics,
      );
    }

    const color6 = parseColor6(node, options);
    if (color6) return color6;

    if (name === 'color') {
      const extension = parseColorFunctionExtensions(node, options);
      if (extension) return extension;
    }
  }

  // CSSTools 覆盖 Color 4 与可静态求值的 Color 5。
  const upstream = parseWithCssTools(node);
  if (upstream) {
    if (upstream.nonStaticAlpha) {
      return contextualResult(
        upstream.syntax,
        classifyUnsupportedExperimental('alpha'),
        upstream.specLevel,
        upstream.experimental,
        [createDiagnostic('upstream-unsupported', 'info', 'diagnostic.nonStaticAlpha')],
      );
    }
    const resolved = upstream.resolved;
    let diagnostics: ColorDiagnostic[] = [];
    if (isHdrSourceSpace(resolved.originalSpace)) {
      diagnostics = [createDiagnostic('hdr-tone-mapped', 'info', 'diagnostic.hdrValue')];
    }
    return resolvedResult(
      upstream.syntax,
      resolved,
      upstream.specLevel,
      upstream.experimental,
      diagnostics,
    );
  }

  const functionLabel = functionName(node) ?? node.toString();
  return invalid(functionLabel, [
    createDiagnostic('unknown-function', 'warning', 'diagnostic.unknownSyntax', [functionLabel]),
  ]);
}

/** 便于测试与 Hover 局部解析: 直接解析一段 CSS 文本中的第一个 component value。 */
export function parseColorText(css: string, options: ParseOptions): ParsedColor | undefined {
  const node = parseSingleComponentValue(css);
  if (!node) return undefined;
  return parseComponentValueColor(node, options);
}
