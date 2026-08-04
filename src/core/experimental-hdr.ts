/**
 * CSS Color HDR 1 (ED 2026-07-28) 支持, 默认关闭。
 *
 * CSSTools 4.1.10 不解析本模块涉及的任何语法 (实测见 `scripts/probe-upstream.mjs`),
 * 因此这里在 component value 树上自行解析, 色彩转换仍交给 Color.js
 * (Color.js 0.7.1 提供 `ictcp`、`jzazbz`、`jzczhz`、`rec2100pq`、`rec2100hlg`、`rec2100-linear`)。
 *
 * 已知假设 (草案未给出明确的百分比参考值, 已记入方案未决项):
 * - `ictcp()`: I 的 100% = 1, Ct/Cp 的 100% = 0.5。
 * - `jzazbz()`: Jz 的 100% = 1, az/bz 的 100% = 0.5。
 * - `jzczhz()`: Jz 的 100% = 1, Cz 的 100% = 0.5, hue 为 `<hue>`。
 * 使用 `<number>` 时不涉及该假设。
 */
import { buildResolved } from './colorjs-bridge.js';
import {
  functionName,
  isFromKeyword,
  readAlpha,
  readChannel,
  readHue,
  splitFunctionArguments,
  type ComponentValue,
} from './csstools-bridge.js';
import type { ColorDiagnostic, ResolvedColor } from './types.js';
import { createDiagnostic } from './types.js';

/** 每个 HDR 函数的百分比参考值。 */
const PERCENT_REFERENCE: Readonly<Record<string, readonly [number, number, number]>> = Object.freeze({
  ictcp: [1, 0.5, 0.5],
  jzazbz: [1, 0.5, 0.5],
  jzczhz: [1, 0.5, 0],
});

export interface HdrParseResult {
  readonly resolved?: ResolvedColor;
  readonly syntax: string;
  /** `hdr-color()` 依赖显示器 headroom, 恒为 contextual。 */
  readonly headroomDependent: boolean;
  readonly diagnostics: readonly ColorDiagnostic[];
  /** 实际采用的函数名, 用于记录 `hdr-color` 与 `color-hdr` 的差异。 */
  readonly usedName: string;
}

/** 解析 `ictcp()` / `jzazbz()` / `jzczhz()`。 */
function parseHdrChannelFunction(name: string, node: ComponentValue): HdrParseResult | undefined {
  const args = splitFunctionArguments(node);
  let groups = args.groups;

  // 相对颜色形式 `from <color>` 暂不求值: 需要先把原点颜色转换到 HDR 空间,
  // 这一步依赖草案尚未稳定的 relative color processing space 定义。
  if (isFromKeyword(groups[0])) {
    return {
      syntax: name,
      headroomDependent: false,
      usedName: name,
      diagnostics: [
        createDiagnostic('upstream-unsupported', 'info', 'diagnostic.hdrRelativeUnsupported', [name]),
      ],
    };
  }

  if (groups.length !== 3) return undefined;
  groups = groups.slice(0, 3);

  const reference = PERCENT_REFERENCE[name] ?? ([1, 1, 1] as const);
  const first = readChannel(groups[0], reference[0]);
  const second = readChannel(groups[1], reference[1]);
  const third = name === 'jzczhz' ? readHue(groups[2]) : readChannel(groups[2], reference[2]);
  if (first === undefined || second === undefined || third === undefined) return undefined;

  const alpha = readAlpha(args.alpha);
  if (alpha === undefined) return undefined;

  const resolved = buildResolved({
    cssSpace: name,
    channels: [first, second, third],
    alpha: Number.isNaN(alpha) ? 0 : alpha,
  });

  return { resolved, syntax: name, headroomDependent: false, usedName: name, diagnostics: [] };
}

/**
 * 解析 `hdr-color()` / `color-hdr()`。
 * 结果依赖显示器 headroom, 因此不返回绝对颜色, 只返回可静态求值的候选分支。
 */
function parseHdrColorFunction(name: string): HdrParseResult {
  return {
    syntax: 'hdr-color',
    headroomDependent: true,
    usedName: name,
    diagnostics: [createDiagnostic('hdr-tone-mapped', 'info', 'diagnostic.hdrHeadroomDependent', [name])],
  };
}

/** HDR 函数入口。返回 undefined 表示不是 HDR 函数或语法无效。 */
export function parseHdrFunction(node: ComponentValue): HdrParseResult | undefined {
  const name = functionName(node);
  if (!name) return undefined;
  if (name === 'ictcp' || name === 'jzazbz' || name === 'jzczhz') {
    return parseHdrChannelFunction(name, node);
  }
  if (name === 'hdr-color' || name === 'color-hdr') {
    return parseHdrColorFunction(name);
  }
  return undefined;
}

/**
 * HDR 颜色在 sRGB 中的预览。
 * `reinhard` 使用 x / (1 + x) 对线性光做压缩, `clip` 直接裁剪, `none` 不处理。
 */
export function toneMapForPreview(
  resolved: ResolvedColor,
  mode: 'none' | 'reinhard' | 'clip',
): ResolvedColor {
  if (mode === 'none') return resolved;
  const [x, y, z] = resolved.xyzD50;
  if (mode === 'clip') {
    return { ...resolved, xyzD50: [Math.min(x, 1), Math.min(y, 1), Math.min(z, 1)], hdrToneMapped: true };
  }
  const scale = y > 1 ? 1 / (1 + (y - 1)) : 1;
  if (scale === 1) return resolved;
  return { ...resolved, xyzD50: [x * scale, y * scale, z * scale], hdrToneMapped: true };
}

/** 该 CSS 空间是否属于 HDR 空间。 */
export function isHdrSourceSpace(space: string): boolean {
  return (
    space === 'rec2100-pq' ||
    space === 'rec2100-hlg' ||
    space === 'rec2100-linear' ||
    space === 'ictcp' ||
    space === 'jzazbz' ||
    space === 'jzczhz'
  );
}
