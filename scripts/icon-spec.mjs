/**
 * W3C Color Toolkit 的图标: 底座 + OKLCH 色环 + 环心三块并排色卡。
 *
 * 色环的每个角度用 `oklch(L C h)` 取色再映射到 sRGB, 因此整圈亮度在感知上是均匀的
 * (直接用 HSL 会出现黄色偏亮, 蓝色偏暗)。这既是本扩展的能力本身, 也让图标在小尺寸下更干净。
 *
 * 环心的三块色卡对应扩展的另外两项核心能力: 内联色卡, 以及同一个颜色在多种色彩空间之间的
 * 互转 —— 三块并排读起来是"同一处颜色的多种表示", 而不是一块孤立的色板。三块的颜色取自
 * 色环上等距的三个角度, 与环身同源, 因此配色不会打架。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 * SVG 没有 conic-gradient, 渲染层会把色环展开成足够密的扇形分段。
 */
import Color from 'colorjs.io';

import { SIZE, baseShapes } from './lib/icon-brand.mjs';

const CENTER = SIZE / 2;
const RING_OUTER = 0.375 * SIZE;
/** 内径要给环心的色卡让出位置: 色卡外接半径约 41, 这里留到 56 仍有余量。 */
const RING_INNER = 0.219 * SIZE;

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

/** 色卡沿用环身的取色函数, 只是把结果写成十六进制。 */
function swatchColor(hueDegrees) {
  return `#${ringColor(hueDegrees)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

const SWATCH_HUES = [25, 145, 265];
const SWATCH_WIDTH = 22;
const SWATCH_HEIGHT = 36;
const SWATCH_GAP = 4;

const SWATCH_SPAN = SWATCH_HUES.length * SWATCH_WIDTH + (SWATCH_HUES.length - 1) * SWATCH_GAP;
const SWATCH_LEFT = CENTER - SWATCH_SPAN / 2;

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
    ...SWATCH_HUES.map((hue, index) => ({
      kind: 'roundedRect',
      x: SWATCH_LEFT + index * (SWATCH_WIDTH + SWATCH_GAP),
      y: CENTER - SWATCH_HEIGHT / 2,
      w: SWATCH_WIDTH,
      h: SWATCH_HEIGHT,
      r: 8,
      fill: swatchColor(hue),
    })),
  ],
};
