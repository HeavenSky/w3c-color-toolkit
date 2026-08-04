/**
 * 颜色序列化。
 *
 * 自行实现而不直接用 Color.js 的 `toString()`, 原因:
 * - Color.js 会把 `#ff8800` 缩写为 `#f80`, 而这里需要稳定的 6/8 位输出;
 * - 需要按配置控制精度、Hex 大小写、`modern`/`legacy` 风格;
 * - 需要把色域映射、alpha 丢失和 missing component 丢失作为结构化结果返回,
 *   而不是只给一个字符串。
 */
import { toGamut } from './gamut.js';
import { lookupNamedColor, NAMED_COLORS } from './keywords.js';
import type { ResolvedColor, SerializedColor, SerializerOptions } from './types.js';

/** 支持的转换目标。与 `features/convert/format-catalog.ts` 一一对应。 */
export type TargetFormat =
  | 'hex'
  | 'rgb'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'named-color'
  | 'color-srgb'
  | 'color-srgb-linear'
  | 'color-display-p3'
  | 'color-display-p3-linear'
  | 'color-a98-rgb'
  | 'color-prophoto-rgb'
  | 'color-rec2020'
  | 'color-xyz-d50'
  | 'color-xyz-d65'
  | 'ictcp'
  | 'jzazbz'
  | 'jzczhz'
  | 'color-rec2100-pq'
  | 'color-rec2100-hlg'
  | 'color-rec2100-linear';

/** 目标格式 → CSS 空间关键字。 */
const TARGET_SPACE: Readonly<Record<TargetFormat, string>> = Object.freeze({
  hex: 'srgb',
  rgb: 'srgb',
  hsl: 'hsl',
  hwb: 'hwb',
  lab: 'lab',
  lch: 'lch',
  oklab: 'oklab',
  oklch: 'oklch',
  'named-color': 'srgb',
  'color-srgb': 'srgb',
  'color-srgb-linear': 'srgb-linear',
  'color-display-p3': 'display-p3',
  'color-display-p3-linear': 'display-p3-linear',
  'color-a98-rgb': 'a98-rgb',
  'color-prophoto-rgb': 'prophoto-rgb',
  'color-rec2020': 'rec2020',
  'color-xyz-d50': 'xyz-d50',
  'color-xyz-d65': 'xyz-d65',
  ictcp: 'ictcp',
  jzazbz: 'jzazbz',
  jzczhz: 'jzczhz',
  'color-rec2100-pq': 'rec2100-pq',
  'color-rec2100-hlg': 'rec2100-hlg',
  'color-rec2100-linear': 'rec2100-linear',
});

/** 无法表达 alpha 的目标格式。 */
const ALPHA_CAPABLE: ReadonlySet<TargetFormat> = new Set<TargetFormat>([
  'hex',
  'rgb',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color-srgb',
  'color-srgb-linear',
  'color-display-p3',
  'color-display-p3-linear',
  'color-a98-rgb',
  'color-prophoto-rgb',
  'color-rec2020',
  'color-xyz-d50',
  'color-xyz-d65',
  'ictcp',
  'jzazbz',
  'jzczhz',
  'color-rec2100-pq',
  'color-rec2100-hlg',
  'color-rec2100-linear',
]);

export function targetSpace(target: TargetFormat): string {
  return TARGET_SPACE[target];
}

export function targetSupportsAlpha(target: TargetFormat): boolean {
  return ALPHA_CAPABLE.has(target);
}

/**
 * 按有效数字位数格式化, 去掉多余的尾随零。
 *
 * 约束:
 * - 不做 locale 化, 一律使用 `.` 作为小数点, 否则会生成非法 CSS;
 * - 绝对值小于 1e-6 的值输出 `0`, 避免出现 `-0` 或 `-1e-7` 这类噪音;
 * - 只有绝对值 >= 1e6 时才允许科学计数法 (CSS `<number>` 接受该形式)。
 */
export function formatNumber(value: number, precision: number): string {
  if (Number.isNaN(value)) return 'none';
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < 1e-6) return '0';

  const formatted = value.toPrecision(precision);
  if (formatted.includes('e')) {
    if (Math.abs(value) >= 1e6) return formatted;
    // 小数量级: 展开为定点表示, 避免指数形式。
    const expanded = Number(formatted).toFixed(Math.max(precision + 6, 12));
    return trimTrailingZeros(expanded);
  }
  return trimTrailingZeros(formatted);
}

function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) return text;
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '-0' || trimmed === '' ? '0' : trimmed;
}

function formatAlpha(alpha: number, precision: number): string {
  return formatNumber(alpha, Math.max(precision, 2));
}

function to8Bit(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function hexPair(value: number, hexCase: 'lower' | 'upper'): string {
  const text = to8Bit(value).toString(16).padStart(2, '0');
  return hexCase === 'upper' ? text.toUpperCase() : text;
}

interface Prepared {
  readonly coords: readonly [number, number, number];
  readonly alpha: number;
  readonly gamutMapped: boolean;
  readonly missingComponentsLost: boolean;
}

/**
 * 目标格式与原空间相同时保留原始分量 (包含 `none`);
 * 空间不同时按计算值转换, 此时 missing component 无法保留。
 */
function prepare(
  resolved: ResolvedColor,
  target: TargetFormat,
  options: SerializerOptions,
): Prepared {
  const space = TARGET_SPACE[target];
  const sameSpace = resolved.originalSpace === space;

  if (sameSpace) {
    const coords = [0, 1, 2].map((index) => {
      const value = resolved.originalChannels[index];
      return value === null ? Number.NaN : value;
    }) as [number, number, number];
    return { coords, alpha: resolved.alpha, gamutMapped: false, missingComponentsLost: false };
  }

  const mapped = toGamut(resolved, space, options.gamutMapping);
  return {
    coords: mapped.coords,
    alpha: mapped.alpha,
    gamutMapped: mapped.mapped,
    missingComponentsLost: resolved.missingComponents.length > 0,
  };
}

function channel(value: number, precision: number, options: SerializerOptions): string {
  if (Number.isNaN(value)) return options.computeMissingComponents ? '0' : 'none';
  return formatNumber(value, precision);
}

function percentChannel(value: number, precision: number, options: SerializerOptions): string {
  if (Number.isNaN(value)) return options.computeMissingComponents ? '0%' : 'none';
  return `${formatNumber(value, precision)}%`;
}

/** 序列化到目标格式。 */
export function serialize(
  resolved: ResolvedColor,
  target: TargetFormat,
  options: SerializerOptions,
): SerializedColor {
  const prepared = prepare(resolved, target, options);
  const alphaVisible = prepared.alpha < 1 || Number.isNaN(prepared.alpha);
  const alphaLost = alphaVisible && !targetSupportsAlpha(target);

  return {
    text: serializeText(prepared, target, options, alphaVisible),
    gamutMapped: prepared.gamutMapped,
    alphaLost,
    missingComponentsLost: prepared.missingComponentsLost,
    hdrToneMapped: resolved.hdrToneMapped,
  };
}

function serializeText(
  prepared: Prepared,
  target: TargetFormat,
  options: SerializerOptions,
  alphaVisible: boolean,
): string {
  const { precision, hexCase, syntax } = options;
  const [c0, c1, c2] = prepared.coords;
  const alpha = prepared.alpha;

  switch (target) {
    case 'hex': {
      const rgb = `#${hexPair(c0, hexCase)}${hexPair(c1, hexCase)}${hexPair(c2, hexCase)}`;
      if (!alphaVisible) return rgb;
      return `${rgb}${hexPair(Number.isNaN(alpha) ? 1 : alpha, hexCase)}`;
    }
    case 'named-color': {
      const nearest = nearestNamedColor(prepared.coords);
      return nearest ?? 'transparent';
    }
    case 'rgb': {
      const r = formatNumber(Number.isNaN(c0) ? 0 : c0 * 255, precision);
      const g = formatNumber(Number.isNaN(c1) ? 0 : c1 * 255, precision);
      const b = formatNumber(Number.isNaN(c2) ? 0 : c2 * 255, precision);
      if (syntax === 'legacy') {
        return alphaVisible
          ? `rgba(${r}, ${g}, ${b}, ${formatAlpha(alpha, precision)})`
          : `rgb(${r}, ${g}, ${b})`;
      }
      const parts = [channelOrNone(c0, c0 * 255, precision, options), channelOrNone(c1, c1 * 255, precision, options), channelOrNone(c2, c2 * 255, precision, options)];
      return alphaVisible
        ? `rgb(${parts.join(' ')} / ${formatAlpha(alpha, precision)})`
        : `rgb(${parts.join(' ')})`;
    }
    case 'hsl': {
      const h = channel(c0, precision, options);
      const s = percentChannel(c1, precision, options);
      const l = percentChannel(c2, precision, options);
      if (syntax === 'legacy') {
        const hh = Number.isNaN(c0) ? '0' : formatNumber(c0, precision);
        const ss = Number.isNaN(c1) ? '0' : formatNumber(c1, precision);
        const ll = Number.isNaN(c2) ? '0' : formatNumber(c2, precision);
        return alphaVisible
          ? `hsla(${hh}, ${ss}%, ${ll}%, ${formatAlpha(alpha, precision)})`
          : `hsl(${hh}, ${ss}%, ${ll}%)`;
      }
      return alphaVisible
        ? `hsl(${h} ${s} ${l} / ${formatAlpha(alpha, precision)})`
        : `hsl(${h} ${s} ${l})`;
    }
    case 'hwb': {
      const h = channel(c0, precision, options);
      const w = percentChannel(c1, precision, options);
      const b = percentChannel(c2, precision, options);
      return alphaVisible
        ? `hwb(${h} ${w} ${b} / ${formatAlpha(alpha, precision)})`
        : `hwb(${h} ${w} ${b})`;
    }
    case 'lab':
    case 'oklab': {
      const l = channel(c0, precision, options);
      const a = channel(c1, precision, options);
      const b = channel(c2, precision, options);
      return alphaVisible
        ? `${target}(${l} ${a} ${b} / ${formatAlpha(alpha, precision)})`
        : `${target}(${l} ${a} ${b})`;
    }
    case 'lch':
    case 'oklch': {
      const l = channel(c0, precision, options);
      const c = channel(c1, precision, options);
      const h = channel(c2, precision, options);
      return alphaVisible
        ? `${target}(${l} ${c} ${h} / ${formatAlpha(alpha, precision)})`
        : `${target}(${l} ${c} ${h})`;
    }
    case 'ictcp':
    case 'jzazbz':
    case 'jzczhz': {
      const a0 = channel(c0, precision, options);
      const a1 = channel(c1, precision, options);
      const a2 = channel(c2, precision, options);
      return alphaVisible
        ? `${target}(${a0} ${a1} ${a2} / ${formatAlpha(alpha, precision)})`
        : `${target}(${a0} ${a1} ${a2})`;
    }
    default: {
      const space = TARGET_SPACE[target];
      const a0 = channel(c0, precision, options);
      const a1 = channel(c1, precision, options);
      const a2 = channel(c2, precision, options);
      return alphaVisible
        ? `color(${space} ${a0} ${a1} ${a2} / ${formatAlpha(alpha, precision)})`
        : `color(${space} ${a0} ${a1} ${a2})`;
    }
  }
}

function channelOrNone(
  raw: number,
  scaled: number,
  precision: number,
  options: SerializerOptions,
): string {
  if (Number.isNaN(raw)) return options.computeMissingComponents ? '0' : 'none';
  return formatNumber(scaled, precision);
}

/** 8-bit sRGB → 命名颜色的反向索引, 模块加载时构建一次。 */
const REVERSE_NAMED: ReadonlyMap<number, string> = (() => {
  const map = new Map<number, string>();
  for (const [name, rgb] of Object.entries(NAMED_COLORS)) {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    // 同一颜色有多个别名时保留字典序更小的那个 (如 aqua 而非 cyan), 保证输出稳定。
    const existing = map.get(key);
    if (existing === undefined || name < existing) map.set(key, name);
  }
  return map;
})();

/** 精确匹配的命名颜色; 不存在时返回 undefined。 */
export function exactNamedColor(coords: readonly [number, number, number]): string | undefined {
  const key = (to8Bit(coords[0]) << 16) | (to8Bit(coords[1]) << 8) | to8Bit(coords[2]);
  return REVERSE_NAMED.get(key);
}

/** 最近的命名颜色, 按 8-bit sRGB 欧氏距离。 */
export function nearestNamedColor(coords: readonly [number, number, number]): string | undefined {
  const r = to8Bit(coords[0]);
  const g = to8Bit(coords[1]);
  const b = to8Bit(coords[2]);
  let bestName: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, rgb] of Object.entries(NAMED_COLORS)) {
    const distance = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (distance < bestDistance || (distance === bestDistance && bestName !== undefined && name < bestName)) {
      bestDistance = distance;
      bestName = name;
    }
  }
  return bestName;
}

export { lookupNamedColor };
