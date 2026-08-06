/**
 * 图标渲染共享实现: 一份声明式 spec 同时产出 SVG (矢量) 与 PNG (光栅)。
 *
 * 存在的理由: 以前 `media/icon.svg` 手写一遍几何, `scripts/render-icon.mjs` 又用解析式
 * 重写同一套几何, 两处真源改一处忘另一处就会静默漂移。现在图形只在
 * `scripts/icon-spec.mjs` 里描述一次, SVG 与 PNG 都由本文件从同一份数据生成。
 *
 * 本文件是通用渲染实现, 不含任何与具体图形有关的信息; 图形只在 `icon-spec.mjs` 里描述。
 *
 * ── spec 格式 ────────────────────────────────────────────────
 * {
 *   size: 256,                       // 画布边长 (正方形)
 *   label: 'Editor Console Toolkit', // 写入 SVG 的 aria-label
 *   shapes: [ <shape>, ... ]         // 按顺序绘制, 后画的盖住先画的
 * }
 *
 * shape 支持的种类:
 *   { kind: 'roundedRect',   x, y, w, h, r, fill }
 *   { kind: 'roundedRectStroke', x, y, w, h, r, stroke, strokeWidth }
 *   { kind: 'polyline',      points: [[x, y], ...], stroke, strokeWidth }
 *   { kind: 'circle',        cx, cy, r, fill }
 *   { kind: 'ring',          cx, cy, outer, inner, fill }
 *
 * fill / stroke (paint) 支持:
 *   '#RRGGBB'
 *   { kind: 'linear', from: '#RRGGBB', to: '#RRGGBB', direction: 'diagonal' | 'vertical' | 'horizontal' }
 *   { kind: 'conic',  colorAt: (hueDegrees) => '#RRGGBB' | [r, g, b], segments?: number }
 *
 * 渐变坐标与 SVG 的 `gradientUnits="objectBoundingBox"` 语义一致: t 相对图形的
 * **几何**包围盒 (不含描边宽度), 因此 SVG 与 PNG 的取色逐点相同。
 * conic 只对 `ring` 有意义; 角度以 12 点方向为 0 度, 顺时针递增。
 */
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib';

// ── 颜色 ────────────────────────────────────────────────────
const hexToRgb = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const toRgb = (color) => (typeof color === 'string' ? hexToRgb(color) : color);

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

const mixRgb = (from, to, t) => {
  const k = clamp01(t);
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
  ];
};

const rgbToHex = (rgb) =>
  `#${rgb
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;

// ── 几何 ────────────────────────────────────────────────────
/** 圆角矩形内部判定; r 为 0 时退化为普通矩形。 */
const insideRoundedRect = (px, py, x, y, w, h, r) => {
  if (w <= 0 || h <= 0) return false;
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.max(Math.abs(px - cx) - (w / 2 - radius), 0);
  const dy = Math.max(Math.abs(py - cy) - (h / 2 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
};

/** 圆头线段 (胶囊): 点到线段的距离不超过半宽。用来表达 round 端点与 round 连接。 */
const insideCapsule = (px, py, x1, y1, x2, y2, thickness) => {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq === 0 ? 0 : clamp01((wx * vx + wy * vy) / lengthSq);
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return dx * dx + dy * dy <= (thickness / 2) ** 2;
};

/** 12 点方向为 0 度, 顺时针递增; 与 SVG 的屏幕坐标系 (y 向下) 一致。 */
const pointOnCircle = (cx, cy, radius, degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)];
};

/** 图形的几何包围盒, 供渐变换算 t 使用 (与 objectBoundingBox 一致, 不含描边)。 */
function boundingBox(shape) {
  switch (shape.kind) {
    case 'roundedRect':
    case 'roundedRectStroke':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'polyline': {
      const xs = shape.points.map((point) => point[0]);
      const ys = shape.points.map((point) => point[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'circle':
      return { x: shape.cx - shape.r, y: shape.cy - shape.r, w: shape.r * 2, h: shape.r * 2 };
    case 'ring':
      return {
        x: shape.cx - shape.outer,
        y: shape.cy - shape.outer,
        w: shape.outer * 2,
        h: shape.outer * 2,
      };
    default:
      throw new Error(`未知的 shape.kind: ${shape.kind}`);
  }
}

/** 描边居中在路径上, 因此向外与向内各扩 strokeWidth/2。 */
function strokeBands(shape) {
  const half = shape.strokeWidth / 2;
  return {
    outer: { x: shape.x - half, y: shape.y - half, w: shape.w + shape.strokeWidth, h: shape.h + shape.strokeWidth, r: shape.r + half },
    inner: { x: shape.x + half, y: shape.y + half, w: shape.w - shape.strokeWidth, h: shape.h - shape.strokeWidth, r: shape.r - half },
  };
}

// ── PNG 取色 ────────────────────────────────────────────────
/** 把 paint 编译成 `(px, py) => [r, g, b]`。 */
function compilePaint(paint, shape) {
  if (typeof paint === 'string') {
    const rgb = hexToRgb(paint);
    return () => rgb;
  }

  if (paint.kind === 'linear') {
    const from = hexToRgb(paint.from);
    const to = hexToRgb(paint.to);
    const box = boundingBox(shape);
    const tx = (px) => (box.w === 0 ? 0 : (px - box.x) / box.w);
    const ty = (py) => (box.h === 0 ? 0 : (py - box.y) / box.h);
    // 与 SVG 同一套投影: 渐变向量为单位向量时 t 即坐标, 对角线时为两者均值。
    if (paint.direction === 'vertical') return (px, py) => mixRgb(from, to, ty(py));
    if (paint.direction === 'horizontal') return (px, py) => mixRgb(from, to, tx(px));
    return (px, py) => mixRgb(from, to, (tx(px) + ty(py)) / 2);
  }

  if (paint.kind === 'conic') {
    // 按半度缓存: 256px 画布上相邻像素的角差远大于此, 视觉无损而省掉大量取色计算。
    const cache = new Map();
    return (px, py) => {
      const angle = (Math.atan2(px - shape.cx, shape.cy - py) * 180) / Math.PI;
      const hue = (angle + 360) % 360;
      const key = Math.round(hue * 2) / 2;
      let rgb = cache.get(key);
      if (!rgb) {
        rgb = toRgb(paint.colorAt(key));
        cache.set(key, rgb);
      }
      return rgb;
    };
  }

  throw new Error(`未知的 paint.kind: ${paint.kind}`);
}

/** 把 shape 编译成 `{ inside(px, py), color(px, py) }`。 */
function compileShape(shape) {
  switch (shape.kind) {
    case 'roundedRect':
      return {
        inside: (px, py) => insideRoundedRect(px, py, shape.x, shape.y, shape.w, shape.h, shape.r),
        color: compilePaint(shape.fill, shape),
      };
    case 'roundedRectStroke': {
      const { outer, inner } = strokeBands(shape);
      return {
        inside: (px, py) =>
          insideRoundedRect(px, py, outer.x, outer.y, outer.w, outer.h, outer.r) &&
          !insideRoundedRect(px, py, inner.x, inner.y, inner.w, inner.h, inner.r),
        color: compilePaint(shape.stroke, shape),
      };
    }
    case 'polyline':
      return {
        inside: (px, py) => {
          for (let i = 0; i < shape.points.length - 1; i += 1) {
            const [x1, y1] = shape.points[i];
            const [x2, y2] = shape.points[i + 1];
            if (insideCapsule(px, py, x1, y1, x2, y2, shape.strokeWidth)) return true;
          }
          return false;
        },
        color: compilePaint(shape.stroke, shape),
      };
    case 'circle':
      return {
        inside: (px, py) => (px - shape.cx) ** 2 + (py - shape.cy) ** 2 <= shape.r ** 2,
        color: compilePaint(shape.fill, shape),
      };
    case 'ring':
      return {
        inside: (px, py) => {
          const distanceSq = (px - shape.cx) ** 2 + (py - shape.cy) ** 2;
          return distanceSq >= shape.inner ** 2 && distanceSq <= shape.outer ** 2;
        },
        color: compilePaint(shape.fill, shape),
      };
    default:
      throw new Error(`未知的 shape.kind: ${shape.kind}`);
  }
}

// ── PNG ────────────────────────────────────────────────────
function crc32(buffer) {
  if (typeof zlibCrc32 === 'function') return zlibCrc32(buffer) >>> 0;
  let crc = 0xffffffff;
  for (const byte of buffer) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * 光栅化为 RGBA PNG。
 *
 * `supersample` 为每轴超采样数 (默认 4, 即每像素 16 个采样点), 用于抗锯齿。
 * 图形按 spec 顺序逐层覆盖且视为完全不透明, 因此 alpha 只出现在画布最外轮廓的边缘。
 */
export function renderPng(spec, { supersample = 4 } = {}) {
  const size = spec.size;
  const layers = spec.shapes.map(compileShape);
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const px = x + (sx + 0.5) / supersample;
          const py = y + (sy + 0.5) / supersample;
          let sample = null;
          for (const layer of layers) {
            if (layer.inside(px, py)) sample = layer.color(px, py);
          }
          if (sample) {
            r += sample[0];
            g += sample[1];
            b += sample[2];
            covered += 1;
          }
        }
      }
      const offset = rowStart + 1 + x * 4;
      // 颜色按已覆盖的采样求均值 (而不是除以总采样数), 否则半透明边缘会发黑。
      raw[offset] = covered ? Math.round(r / covered) : 0;
      raw[offset + 1] = covered ? Math.round(g / covered) : 0;
      raw[offset + 2] = covered ? Math.round(b / covered) : 0;
      raw[offset + 3] = Math.round((covered / (supersample * supersample)) * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── SVG ────────────────────────────────────────────────────
const round = (value) => Number(value.toFixed(3));

/** 把 conic 环展开成 N 段扇形路径: SVG 没有 conic-gradient, 只能用足够密的分段近似。 */
function conicWedges(shape, indent) {
  const segments = shape.fill.segments ?? 180;
  const step = 360 / segments;
  // 相邻扇形各向前多画 step/4, 覆盖抗锯齿后可能出现的一像素缝隙。
  const overlap = step / 4;
  const lines = [];
  for (let i = 0; i < segments; i += 1) {
    const start = i * step;
    const end = start + step + overlap;
    const color = rgbToHex(toRgb(shape.fill.colorAt(start + step / 2)));
    const [ox1, oy1] = pointOnCircle(shape.cx, shape.cy, shape.outer, start);
    const [ox2, oy2] = pointOnCircle(shape.cx, shape.cy, shape.outer, end);
    const [ix2, iy2] = pointOnCircle(shape.cx, shape.cy, shape.inner, end);
    const [ix1, iy1] = pointOnCircle(shape.cx, shape.cy, shape.inner, start);
    const d = [
      `M${round(ox1)} ${round(oy1)}`,
      `A${round(shape.outer)} ${round(shape.outer)} 0 0 1 ${round(ox2)} ${round(oy2)}`,
      `L${round(ix2)} ${round(iy2)}`,
      `A${round(shape.inner)} ${round(shape.inner)} 0 0 0 ${round(ix1)} ${round(iy1)}`,
      'Z',
    ].join(' ');
    lines.push(`${indent}<path d="${d}" fill="${color}" />`);
  }
  return lines;
}

/** paint → SVG 属性值; 需要 <defs> 时把定义推入 defs 数组。 */
function svgPaint(paint, shape, defs) {
  if (typeof paint === 'string') return paint;
  if (paint.kind === 'linear') {
    const id = `g${defs.length}`;
    const [x2, y2] =
      paint.direction === 'vertical' ? [0, 1] : paint.direction === 'horizontal' ? [1, 0] : [1, 1];
    defs.push(
      [
        `    <linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">`,
        `      <stop offset="0" stop-color="${paint.from}" />`,
        `      <stop offset="1" stop-color="${paint.to}" />`,
        '    </linearGradient>',
      ].join('\n'),
    );
    return `url(#${id})`;
  }
  throw new Error(`paint.kind=${paint.kind} 不能直接作为 SVG 属性 (conic 需展开为扇形)`);
}

/** 生成与 PNG 同形的 SVG。 */
export function renderSvg(spec) {
  const defs = [];
  const body = [];

  for (const shape of spec.shapes) {
    switch (shape.kind) {
      case 'roundedRect':
        body.push(
          `  <rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.w)}" height="${round(shape.h)}" rx="${round(shape.r)}" fill="${svgPaint(shape.fill, shape, defs)}" />`,
        );
        break;
      case 'roundedRectStroke':
        body.push(
          `  <rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.w)}" height="${round(shape.h)}" rx="${round(shape.r)}" fill="none" stroke="${svgPaint(shape.stroke, shape, defs)}" stroke-width="${round(shape.strokeWidth)}" />`,
        );
        break;
      case 'polyline': {
        const d = shape.points
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point[0])} ${round(point[1])}`)
          .join(' ');
        body.push(
          `  <path d="${d}" fill="none" stroke="${svgPaint(shape.stroke, shape, defs)}" stroke-width="${round(shape.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`,
        );
        break;
      }
      case 'circle':
        body.push(
          `  <circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" r="${round(shape.r)}" fill="${svgPaint(shape.fill, shape, defs)}" />`,
        );
        break;
      case 'ring':
        if (typeof shape.fill === 'object' && shape.fill.kind === 'conic') {
          body.push(`  <g>`);
          body.push(...conicWedges(shape, '    '));
          body.push('  </g>');
        } else {
          // 纯色/线性渐变环: 用 even-odd 填充规则挖空中心, 不需要分段。
          const outerBox = `M${round(shape.cx - shape.outer)} ${round(shape.cy)} a${round(shape.outer)} ${round(shape.outer)} 0 1 0 ${round(shape.outer * 2)} 0 a${round(shape.outer)} ${round(shape.outer)} 0 1 0 ${round(-shape.outer * 2)} 0 Z`;
          const innerBox = `M${round(shape.cx - shape.inner)} ${round(shape.cy)} a${round(shape.inner)} ${round(shape.inner)} 0 1 0 ${round(shape.inner * 2)} 0 a${round(shape.inner)} ${round(shape.inner)} 0 1 0 ${round(-shape.inner * 2)} 0 Z`;
          body.push(
            `  <path d="${outerBox} ${innerBox}" fill-rule="evenodd" fill="${svgPaint(shape.fill, shape, defs)}" />`,
          );
        }
        break;
      default:
        throw new Error(`未知的 shape.kind: ${shape.kind}`);
    }
  }

  const lines = [
    '<!-- 由 scripts/gen-icon.mjs 从 scripts/icon-spec.mjs 生成, 请勿手工编辑。 -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size}" height="${spec.size}" viewBox="0 0 ${spec.size} ${spec.size}" role="img" aria-label="${spec.label}">`,
  ];
  if (defs.length > 0) lines.push('  <defs>', ...defs, '  </defs>');
  lines.push(...body, '</svg>', '');
  return lines.join('\n');
}
