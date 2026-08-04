/**
 * 预览色计算: 把任意 `ColorMatch` 变成可用于装饰与 SVG 的 sRGB 颜色字符串。
 *
 * 规则:
 * - 只消费 `resolved`, 或已显式采用预览假设的 contextual;
 * - 广色域先按统一策略映射到 sRGB, Hover 仍显示原始值;
 * - HDR 颜色先做色调映射并置 `hdrToneMapped`。
 */
import { toneMapForPreview, isHdrSourceSpace } from '../../core/experimental-hdr.js';
import { toPreviewSrgb } from '../../core/gamut.js';
import { foregroundFor } from '../../core/contrast.js';
import type { ColorMatch, GamutMapping, HdrToneMapping, ResolvedColor } from '../../core/types.js';

export interface PreviewColor {
  /** `rgba(r, g, b, a)` 形式, 可直接用于装饰与 SVG。 */
  readonly css: string;
  /** 背景模式使用的前景色。 */
  readonly foregroundCss: string;
  readonly gamutMapped: boolean;
  readonly hdrToneMapped: boolean;
}

function to8Bit(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function rgbaString(coords: readonly [number, number, number], alpha: number): string {
  const a = Number.isNaN(alpha) ? 1 : Math.max(0, Math.min(1, alpha));
  return `rgba(${to8Bit(coords[0])}, ${to8Bit(coords[1])}, ${to8Bit(coords[2])}, ${Number(a.toFixed(4))})`;
}

/** 取出可用于预览的 ResolvedColor: resolved 优先, 其次是显式假设值。 */
export function previewSource(match: ColorMatch): ResolvedColor | undefined {
  if (match.resolution === 'resolved') return match.resolved;
  if (match.resolution === 'contextual') return match.contextual?.assumed?.resolved;
  return undefined;
}

/** 可用于预览的 sRGB 数值 (0-1), 供装饰、SVG 与 VS Code 的 `Color` 共用。 */
export interface PreviewSrgb {
  readonly coords: readonly [number, number, number];
  /** `none` alpha 统一按 1 处理, 便于直接送给渲染层。 */
  readonly alpha: number;
  readonly gamutMapped: boolean;
  readonly hdrToneMapped: boolean;
}

/** HDR 源空间先做色调映射; 其余原样返回。 */
function toneMapIfHdr(resolved: ResolvedColor, hdrToneMapping: HdrToneMapping): ResolvedColor {
  return isHdrSourceSpace(resolved.originalSpace)
    ? toneMapForPreview(resolved, hdrToneMapping)
    : resolved;
}

function srgbOf(toneMapped: ResolvedColor, gamutMapping: GamutMapping): PreviewSrgb {
  const mapped = toPreviewSrgb(toneMapped, gamutMapping);
  const alpha = Number.isNaN(toneMapped.alpha) ? 1 : Math.max(0, Math.min(1, toneMapped.alpha));
  return {
    coords: mapped.coords,
    alpha,
    gamutMapped: mapped.mapped,
    hdrToneMapped: toneMapped.hdrToneMapped,
  };
}

export function previewSrgb(
  resolved: ResolvedColor,
  gamutMapping: GamutMapping,
  hdrToneMapping: HdrToneMapping,
): PreviewSrgb {
  return srgbOf(toneMapIfHdr(resolved, hdrToneMapping), gamutMapping);
}

export function computePreviewColor(
  resolved: ResolvedColor,
  gamutMapping: GamutMapping,
  hdrToneMapping: HdrToneMapping,
): PreviewColor {
  const toneMapped = toneMapIfHdr(resolved, hdrToneMapping);
  const preview = srgbOf(toneMapped, gamutMapping);
  const foreground = foregroundFor(toneMapped);
  const foregroundCoords = toPreviewSrgb(foreground, 'clip');
  return {
    css: rgbaString(preview.coords, preview.alpha),
    foregroundCss: rgbaString(foregroundCoords.coords, 1),
    gamutMapped: preview.gamutMapped,
    hdrToneMapped: preview.hdrToneMapped,
  };
}

export { rgbaString, to8Bit };
