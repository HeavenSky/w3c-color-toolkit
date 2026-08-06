/**
 * W3C Color Toolkit 的图标: 底座 + OKLCH 色环 + 中心镂空。
 *
 * 色环的每个角度用 `oklch(L C h)` 取色再映射到 sRGB, 因此整圈亮度在感知上是均匀的
 * (直接用 HSL 会出现黄色偏亮, 蓝色偏暗)。这既是本扩展的能力本身, 也让图标在小尺寸下更干净。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 * SVG 没有 conic-gradient, 渲染层会把色环展开成足够密的扇形分段。
 */
import Color from 'colorjs.io';

import { SIZE, baseShapes } from './lib/icon-brand.mjs';

const CENTER = SIZE / 2;
const RING_OUTER = 0.375 * SIZE;
const RING_INNER = 0.205 * SIZE;

/** 色环取色: 亮度与彩度固定, 只变 hue。 */
const RING_LIGHTNESS = 0.72;
const RING_CHROMA = 0.17;

/** hue → sRGB 8-bit; 超出 sRGB 色域时按 CSS Color 4 规定的方式映射。 */
function ringColor(hueDegrees) {
  const color = new Color({
    space: 'oklch',
    coords: [RING_LIGHTNESS, RING_CHROMA, hueDegrees],
    alpha: 1,
  });
  return color
    .toGamut({ space: 'srgb', method: 'css' })
    .to('srgb')
    .coords.map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
}

export const spec = {
  size: SIZE,
  label: 'W3C Color Toolkit',
  shapes: [
    ...baseShapes(),
    {
      kind: 'ring',
      cx: CENTER,
      cy: CENTER,
      outer: RING_OUTER,
      inner: RING_INNER,
      fill: { kind: 'conic', colorAt: ringColor, segments: 180 },
    },
  ],
};
