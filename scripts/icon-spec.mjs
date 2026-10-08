/**
 * W3C Color Toolkit 的图标: 底座 + 取色面板 + 色相条, 即编辑器里常见的颜色选择器。
 *
 * 上方取色面板用浅色到红色的对角渐变表示饱和度与明度, 白圈把手标出当前取色点;
 * 下方六段色相条取自 HeavenSky 系列图标的同一组强调色, 把手停在红色段, 与面板的色相一致。
 * 对应本扩展的核心能力: 各种取色器场景与颜色格式互转。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 */
import { SIZE, baseShapes } from './lib/icon-brand.mjs';

const WHITE = '#E6EBF5';
const HUES = ['#FF6B60', '#FFC145', '#4EDD6E', '#6FD6FF', '#53ABFF', '#C792EA'];

// 面板与色相条同宽, 关于画布中线左右对称; 整组 (面板顶到色相条把手底) 上下居中
const LEFT = 42;
const WIDTH = SIZE - LEFT * 2;
const PANEL = { y: 53, h: 100, r: 20, from: '#F2F0EA', to: HUES[0] };
const PANEL_KNOB = { x: 166, y: 89, r: 14, color: '#F69389' };
const BAR = { y: 175, h: 22 };
// 把手比色相条粗, 圆心内缩一个半径, 让它不越出色相条左端
const BAR_KNOB = { r: 17 };

const rect = (x, y, w, h, r, fill) => ({ kind: 'roundedRect', x, y, w, h, r, fill });
const circle = (cx, cy, r, fill) => ({ kind: 'circle', cx, cy, r, fill });
/** 白圈把手: 外圈白色, 内圆为当前颜色。 */
const knob = (cx, cy, r, color) => [circle(cx, cy, r, WHITE), circle(cx, cy, r * 0.62, color)];

/** 分段色相条: 两端段先画圆角矩形再用直角矩形补平内侧, 中间段直角矩形略加宽以盖住接缝。 */
function hueBar(y, h) {
  const step = WIDTH / HUES.length;
  return HUES.flatMap((color, index) => {
    const x = LEFT + index * step;
    if (index === 0) return [rect(x, y, step, h, h / 2, color), rect(x + h / 2, y, step - h / 2 + 0.5, h, 0, color)];
    if (index === HUES.length - 1) return [rect(x, y, step, h, h / 2, color), rect(x, y, step - h / 2, h, 0, color)];
    return [rect(x, y, step + 0.5, h, 0, color)];
  });
}

export const spec = {
  size: SIZE,
  label: 'W3C Color Toolkit',
  shapes: [
    ...baseShapes(),
    rect(LEFT, PANEL.y, WIDTH, PANEL.h, PANEL.r, { kind: 'linear', from: PANEL.from, to: PANEL.to, direction: 'diagonal' }),
    ...knob(PANEL_KNOB.x, PANEL_KNOB.y, PANEL_KNOB.r, PANEL_KNOB.color),
    ...hueBar(BAR.y, BAR.h),
    ...knob(LEFT + BAR_KNOB.r, BAR.y + BAR.h / 2, BAR_KNOB.r, HUES[0]),
  ],
};
