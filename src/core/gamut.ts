/**
 * 色域判定与映射。
 *
 * 默认策略 `css` 为 CSS 规范兼容的色域映射, 不做逐通道静默裁剪;
 * `clip` 保留给需要与旧工具链对齐的场景; `none` 不处理, 由调用方自行承担越界值。
 */
import { inGamut, mapToGamut } from './colorjs-bridge.js';
import type { GamutMapping, ResolvedColor } from './types.js';

export interface GamutResult {
  readonly coords: readonly [number, number, number];
  readonly alpha: number;
  readonly mapped: boolean;
}

/** 该颜色是否落在目标空间色域内。 */
export function fitsGamut(resolved: ResolvedColor, cssSpace: string): boolean {
  return inGamut(resolved, cssSpace);
}

/** 转换到目标空间并按策略做色域映射。 */
export function toGamut(
  resolved: ResolvedColor,
  cssSpace: string,
  mapping: GamutMapping,
): GamutResult {
  return mapToGamut(resolved, cssSpace, mapping);
}

/** 预览用: 一律映射到 sRGB。 */
export function toPreviewSrgb(resolved: ResolvedColor, mapping: GamutMapping): GamutResult {
  return mapToGamut(resolved, 'srgb', mapping === 'none' ? 'clip' : mapping);
}

/** Hover 的 `gamut` 字段: 列出该颜色适配的空间。 */
export function describeGamut(resolved: ResolvedColor): {
  readonly srgb: boolean;
  readonly displayP3: boolean;
  readonly rec2020: boolean;
} {
  return {
    srgb: inGamut(resolved, 'srgb'),
    displayP3: inGamut(resolved, 'display-p3'),
    rec2020: inGamut(resolved, 'rec2020'),
  };
}
