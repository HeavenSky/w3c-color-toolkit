/**
 * 图标底座: 画布尺寸, 圆角, 背景渐变与描边。
 *
 * 与 `icon-spec.mjs` 分开是为了让底色, 圆角这类只关乎观感的参数只有一处定义 ——
 * 调整品牌配色时只动本文件, 不必碰前景图形的坐标。
 */
export const SIZE = 256;
export const CORNER_RADIUS = 56;

/** 前景图形可以引用的强调色与前景色。 */
export const ACCENT_FROM = '#6FD6FF';
export const ACCENT_TO = '#3E8BFF';
export const FOREGROUND = '#E6EBF5';

const BACKGROUND_FROM = '#2E3547';
const BACKGROUND_TO = '#171B26';
const BORDER = '#3C4459';
const BORDER_WIDTH = 3;

/** 背景层 + 描边层, 放在 `shapes` 数组最前面。 */
export function baseShapes() {
  return [
    {
      kind: 'roundedRect',
      x: 0,
      y: 0,
      w: SIZE,
      h: SIZE,
      r: CORNER_RADIUS,
      fill: { kind: 'linear', from: BACKGROUND_FROM, to: BACKGROUND_TO, direction: 'diagonal' },
    },
    {
      // 描边居中在路径上, 因此这里向内缩 BORDER_WIDTH, 让描边完整落在画布内。
      kind: 'roundedRectStroke',
      x: BORDER_WIDTH,
      y: BORDER_WIDTH,
      w: SIZE - BORDER_WIDTH * 2,
      h: SIZE - BORDER_WIDTH * 2,
      r: CORNER_RADIUS - BORDER_WIDTH,
      stroke: BORDER,
      strokeWidth: BORDER_WIDTH,
    },
  ];
}
