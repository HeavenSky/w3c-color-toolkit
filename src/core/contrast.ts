/**
 * 对比度与前景色计算。
 *
 * 背景高亮模式需要一个可读的前景色。这里直接基于已解析的 `ResolvedColor` 计算,
 * 不重新解析颜色字符串 (旧 Color Highlight 的 `dynamic-contrast.js` 会二次正则解析)。
 */
import { buildResolved, contrastRatio, relativeLuminance } from './colorjs-bridge.js';
import type { ResolvedColor } from './types.js';

const WHITE: ResolvedColor = buildResolved({ cssSpace: 'srgb', channels: [1, 1, 1], alpha: 1 });
const BLACK: ResolvedColor = buildResolved({ cssSpace: 'srgb', channels: [0, 0, 0], alpha: 1 });

export function white(): ResolvedColor {
  return WHITE;
}

export function black(): ResolvedColor {
  return BLACK;
}

/** WCAG 2.1 相对亮度。 */
export function luminance(color: ResolvedColor): number {
  return relativeLuminance(color);
}

/** WCAG 2.1 对比度。 */
export function contrast(a: ResolvedColor, b: ResolvedColor): number {
  return contrastRatio(a, b);
}

/**
 * 背景模式的前景色: 在黑白之间取对比度更高者。
 * alpha 较低时按与白底合成后的结果判断, 避免半透明背景上出现不可读文字。
 */
export function foregroundFor(background: ResolvedColor): ResolvedColor {
  const effective = background.alpha >= 1 ? background : compositeOnWhite(background);
  return contrast(effective, BLACK) >= contrast(effective, WHITE) ? BLACK : WHITE;
}

function compositeOnWhite(color: ResolvedColor): ResolvedColor {
  const alpha = color.alpha;
  const blend = (channel: number, base: number): number => channel * alpha + base * (1 - alpha);
  return {
    ...color,
    xyzD50: [
      blend(color.xyzD50[0], WHITE.xyzD50[0]),
      blend(color.xyzD50[1], WHITE.xyzD50[1]),
      blend(color.xyzD50[2], WHITE.xyzD50[2]),
    ],
    alpha: 1,
  };
}

/** Hover 的 `contrast-on-white` / `contrast-on-black` 字段。 */
export function contrastAgainstExtremes(color: ResolvedColor): {
  readonly onWhite: number;
  readonly onBlack: number;
} {
  return { onWhite: contrast(color, WHITE), onBlack: contrast(color, BLACK) };
}
