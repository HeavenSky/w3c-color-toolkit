/**
 * 生成扩展图标 `media/icon.png`。
 *
 * 设计: 深色圆角方形底 + OKLCH 色环 + 中心镂空。
 * 色环的每个角度用 `oklch(L C h)` 取色再映射到 sRGB, 因此整圈亮度在感知上是均匀的
 * (直接用 HSL 会出现黄色偏亮、蓝色偏暗)。这既是本扩展的能力本身, 也让图标在小尺寸下更干净。
 *
 * 用法: node scripts/gen-icon.mjs
 */
import Color from 'colorjs.io';
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SIZE = 256;
/** 每个像素的超采样次数 (SS × SS), 用于抗锯齿。 */
const SS = 4;

// ── 几何参数 (相对 SIZE 的比例) ──────────────────────────────
const CORNER_RADIUS = 0.22 * SIZE;
const RING_OUTER = 0.375 * SIZE;
const RING_INNER = 0.205 * SIZE;
const CENTER = SIZE / 2;

// ── 配色 ────────────────────────────────────────────────────
const BACKGROUND = [0x1e, 0x20, 0x2c];
/** 色环取色: 亮度与彩度固定, 只变 hue。 */
const RING_LIGHTNESS = 0.72;
const RING_CHROMA = 0.17;

/** hue → 8-bit sRGB, 超出色域时按 CSS 规范映射。 */
const hueCache = new Map();
function ringColor(hueDegrees) {
  const key = Math.round(hueDegrees * 2) / 2;
  const cached = hueCache.get(key);
  if (cached) return cached;
  const color = new Color({ space: 'oklch', coords: [RING_LIGHTNESS, RING_CHROMA, key], alpha: 1 });
  const srgb = color.toGamut({ space: 'srgb', method: 'css' }).to('srgb');
  const rgb = srgb.coords.map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
  hueCache.set(key, rgb);
  return rgb;
}

/** 圆角矩形的内部判定。 */
function insideRoundedRect(x, y) {
  const r = CORNER_RADIUS;
  const left = r;
  const right = SIZE - r;
  if (x >= left && x <= right) return y >= 0 && y <= SIZE;
  if (y >= left && y <= right) return x >= 0 && x <= SIZE;
  const cx = x < left ? left : right;
  const cy = y < left ? left : right;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * 单个采样点的颜色。
 * 返回 `[r, g, b, a]`, a 为 0-255。
 */
function sample(x, y) {
  if (!insideRoundedRect(x, y)) return [0, 0, 0, 0];

  const dx = x - CENTER;
  const dy = y - CENTER;
  const distance = Math.hypot(dx, dy);

  if (distance >= RING_INNER && distance <= RING_OUTER) {
    // atan2 以 12 点方向为 0 度, 顺时针递增, 视觉上更像常见的色轮。
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const hue = (angle + 360) % 360;
    const [r, g, b] = ringColor(hue);
    return [r, g, b, 255];
  }

  return [...BACKGROUND, 255];
}

// ── 光栅化 (超采样抗锯齿) ────────────────────────────────────
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py += 1) {
  const rowStart = py * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter type: none
  for (let px = 0; px < SIZE; px += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const [sr, sg, sb, sa] = sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
        // 按 alpha 加权累积颜色, 避免半透明边缘出现黑边。
        r += sr * sa;
        g += sg * sa;
        b += sb * sa;
        a += sa;
      }
    }
    const count = SS * SS;
    const offset = rowStart + 1 + px * 4;
    raw[offset] = a === 0 ? 0 : Math.round(r / a);
    raw[offset + 1] = a === 0 ? 0 : Math.round(g / a);
    raw[offset + 2] = a === 0 ? 0 : Math.round(b / a);
    raw[offset + 3] = Math.round(a / count);
  }
}

// ── PNG 封装 ────────────────────────────────────────────────
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

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(join(ROOT, 'media'), { recursive: true });
const target = join(ROOT, 'media/icon.png');
writeFileSync(target, png);
console.log(`wrote media/icon.png — ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB`);
