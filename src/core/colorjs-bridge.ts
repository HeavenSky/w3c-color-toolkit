/**
 * Color.js 桥接层。
 *
 * 只有本文件和 `csstools-bridge.ts` 可以引用第三方颜色库,
 * 其余模块一律通过 `types.ts` 的契约通信。
 *
 * 2026-08-04 实测: Color.js 0.7.1 的空间 id 与 CSS 关键字并不一致
 * (CSS `display-p3` 对应 `p3`, `a98-rgb` 对应 `a98rgb`, `rec2100-pq` 对应 `rec2100pq` 等),
 * 因此必须显式维护映射, 不能直接把 CSS 关键字传给 Color.js。
 * Color.js 用 `null` 表示 missing component, CSSTools 用 `NaN`, 桥接层负责互转。
 */
import Color from 'colorjs.io';

import type { GamutMapping, ResolvedColor } from './types.js';

/** CSS 空间关键字 → Color.js 空间 id。 */
const CSS_TO_COLORJS: Readonly<Record<string, string>> = Object.freeze({
  srgb: 'srgb',
  'srgb-linear': 'srgb-linear',
  'display-p3': 'p3',
  'display-p3-linear': 'p3-linear',
  'a98-rgb': 'a98rgb',
  'prophoto-rgb': 'prophoto',
  rec2020: 'rec2020',
  xyz: 'xyz-d65',
  'xyz-d50': 'xyz-d50',
  'xyz-d65': 'xyz-d65',
  rgb: 'srgb',
  hex: 'srgb',
  hsl: 'hsl',
  hwb: 'hwb',
  lab: 'lab',
  lch: 'lch',
  oklab: 'oklab',
  oklch: 'oklch',
  // CSS Color HDR 1
  'rec2100-pq': 'rec2100pq',
  'rec2100-hlg': 'rec2100hlg',
  'rec2100-linear': 'rec2100-linear',
  ictcp: 'ictcp',
  jzazbz: 'jzazbz',
  jzczhz: 'jzczhz',
  // 非 CSS 的辅助表示
  hsv: 'hsv',
});

const XYZ_D50 = 'xyz-d50';

export class UnknownColorSpaceError extends Error {
  constructor(public readonly space: string) {
    super(`unknown color space: ${space}`);
    this.name = 'UnknownColorSpaceError';
  }
}

export function colorjsSpaceId(cssSpace: string): string {
  const id = CSS_TO_COLORJS[cssSpace.toLowerCase()];
  if (!id) throw new UnknownColorSpaceError(cssSpace);
  return id;
}

export function isKnownCssSpace(cssSpace: string): boolean {
  return cssSpace.toLowerCase() in CSS_TO_COLORJS;
}

/** CSSTools 的 NaN 与 Color.js 的 null 互转。 */
function toColorjsCoords(channels: readonly (number | null)[]): [number, number, number] {
  const coords = [0, 1, 2].map((i) => {
    const v = channels[i];
    return v === null || (typeof v === 'number' && Number.isNaN(v)) ? null : v;
  });
  return coords as unknown as [number, number, number];
}

function normalizeChannels(channels: readonly number[]): (number | null)[] {
  return channels.map((v) => (Number.isNaN(v) ? null : v));
}

export function missingComponentIndices(channels: readonly (number | null)[]): number[] {
  const out: number[] = [];
  channels.forEach((v, i) => {
    if (v === null || (typeof v === 'number' && Number.isNaN(v))) out.push(i);
  });
  return out;
}

export interface BuildResolvedOptions {
  readonly cssSpace: string;
  readonly channels: readonly number[];
  readonly alpha: number;
  readonly approximate?: boolean;
  readonly hdrToneMapped?: boolean;
}

/** 从原空间分量构造 `ResolvedColor`, 计算 XYZ D50 交换色。 */
export function buildResolved(options: BuildResolvedOptions): ResolvedColor {
  const { cssSpace, channels, alpha } = options;
  const spaceId = colorjsSpaceId(cssSpace);
  const original = normalizeChannels(channels);
  // missing component 在计算时按 0 处理, 与 CSS 规范一致; 原值仍保留在 originalChannels。
  const computeCoords = [0, 1, 2].map((i) => {
    const v = original[i];
    return v === null ? 0 : v;
  }) as [number, number, number];
  const color = new Color({ space: spaceId, coords: computeCoords, alpha });
  const xyz = color.to(XYZ_D50).coords.map((value) => (value === null ? 0 : value));
  return {
    xyzD50: [xyz[0], xyz[1], xyz[2]],
    alpha,
    originalSpace: cssSpace.toLowerCase(),
    originalChannels: original,
    missingComponents: missingComponentIndices(original),
    approximate: options.approximate ?? false,
    hdrToneMapped: options.hdrToneMapped ?? false,
  };
}

/** 把 `ResolvedColor` 转换到目标 CSS 空间的分量。 */
export function convertTo(
  resolved: ResolvedColor,
  cssSpace: string,
): { coords: [number, number, number]; alpha: number } {
  const spaceId = colorjsSpaceId(cssSpace);
  const color = new Color({
    space: XYZ_D50,
    coords: [...resolved.xyzD50] as [number, number, number],
    alpha: resolved.alpha,
  });
  const converted = color.to(spaceId);
  const coords = converted.coords.map((c) => (c === null ? 0 : c)) as [number, number, number];
  return { coords, alpha: resolved.alpha };
}

/** 目标空间是否能容纳该颜色。 */
export function inGamut(resolved: ResolvedColor, cssSpace: string): boolean {
  const spaceId = colorjsSpaceId(cssSpace);
  const color = new Color({
    space: XYZ_D50,
    coords: [...resolved.xyzD50] as [number, number, number],
    alpha: resolved.alpha,
  });
  return color.inGamut(spaceId);
}

/**
 * 映射到目标空间色域。
 * `css` 使用规范定义的 OKLCH chroma reduction, `clip` 逐通道裁剪, `none` 不处理。
 */
export function mapToGamut(
  resolved: ResolvedColor,
  cssSpace: string,
  mapping: GamutMapping,
): { coords: [number, number, number]; alpha: number; mapped: boolean } {
  const spaceId = colorjsSpaceId(cssSpace);
  const color = new Color({
    space: XYZ_D50,
    coords: [...resolved.xyzD50] as [number, number, number],
    alpha: resolved.alpha,
  });
  const already = color.inGamut(spaceId);
  if (already || mapping === 'none') {
    const converted = color.to(spaceId);
    return {
      coords: converted.coords.map((c) => (c === null ? 0 : c)) as [number, number, number],
      alpha: resolved.alpha,
      mapped: false,
    };
  }
  const method = mapping === 'clip' ? 'clip' : 'css';
  const mappedColor = color.to(spaceId).toGamut({ space: spaceId, method });
  return {
    coords: mappedColor.coords.map((c) => (c === null ? 0 : c)) as [number, number, number],
    alpha: resolved.alpha,
    mapped: true,
  };
}

/** WCAG 2.1 相对亮度。 */
export function relativeLuminance(resolved: ResolvedColor): number {
  const color = new Color({
    space: XYZ_D50,
    coords: [...resolved.xyzD50] as [number, number, number],
    alpha: 1,
  });
  return color.luminance;
}

/** WCAG 2.1 对比度。 */
export function contrastRatio(a: ResolvedColor, b: ResolvedColor): number {
  const ca = new Color({ space: XYZ_D50, coords: [...a.xyzD50] as [number, number, number], alpha: 1 });
  const cb = new Color({ space: XYZ_D50, coords: [...b.xyzD50] as [number, number, number], alpha: 1 });
  return Math.abs(ca.contrast(cb, 'WCAG21'));
}

/** 供内部复用: 直接从 CSS 字符串构造, 只在测试与 fixture 生成中使用。 */
export function parseCssForTest(css: string): { space: string; coords: number[]; alpha: number } {
  const color = new Color(css);
  return {
    space: color.space.id,
    coords: color.coords.map((c) => (c === null ? Number.NaN : c)),
    alpha: typeof color.alpha === 'number' ? color.alpha : 1,
  };
}

export { toColorjsCoords };
