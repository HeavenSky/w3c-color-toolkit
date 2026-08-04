/**
 * Hover 字段注册表。
 *
 * 字段 id 与 `advanced` 的 `info.fields` / `info.excludedFields` 枚举一一对应;
 * 二者同时命中同一字段时 `excludedFields` 优先。
 */
import { contrastAgainstExtremes } from '../../core/contrast.js';
import { convertTo } from '../../core/colorjs-bridge.js';
import { describeGamut } from '../../core/gamut.js';
import { exactNamedColor, formatNumber, serialize, type TargetFormat } from '../../core/serializer.js';
import type { ResolvedColor, SerializerOptions } from '../../core/types.js';

export type FieldId =
  | 'preview'
  | 'source'
  | 'hex'
  | 'rgb'
  | 'hsl'
  | 'oklch'
  | 'display-p3'
  | 'alpha'
  | 'gamut'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'xyz-d50'
  | 'xyz-d65'
  | 'rec2020'
  | 'a98-rgb'
  | 'prophoto-rgb'
  | 'hsv'
  | 'cmyk'
  | 'css-color-name'
  | 'contrast-on-white'
  | 'contrast-on-black'
  | 'spec-level'
  | 'diagnostics'
  | 'ictcp'
  | 'jzazbz'
  | 'jzczhz'
  | 'rec2100-pq'
  | 'rec2100-hlg'
  | 'rec2100-linear';

/**
 * 默认字段顺序。
 *
 * 默认开启除 `alpha`、`gamut`、`contrast-on-white`、`contrast-on-black` 之外的全部字段。
 * 这四项被排除的理由: alpha 已经体现在各格式的序列化结果里 (例如 `#ff880080`、`rgba(...)`),
 * gamut 与两个对比度是诊断性信息, 日常查看颜色时属于噪音。需要时在
 * `advanced` 的 `info.fields` 中加回, 或用"配置悬停字段"命令勾选。
 *
 * 顺序: 预览与原始语法 → 常用 CSS 格式 → 感知空间 → `color()` 预定义空间 →
 * HDR 空间 (仅 HDR 开关开启时渲染) → 非 CSS 辅助表示 → 元信息。
 */
export const DEFAULT_FIELDS: readonly FieldId[] = Object.freeze([
  'preview',
  'source',
  'hex',
  'rgb',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
  'ictcp',
  'jzazbz',
  'jzczhz',
  'rec2100-pq',
  'rec2100-hlg',
  'rec2100-linear',
  'hsv',
  'cmyk',
  'css-color-name',
  'spec-level',
  'diagnostics',
]);

/** 默认关闭, 需要时显式加入 `info.fields`。 */
export const OPTIONAL_FIELDS: readonly FieldId[] = Object.freeze([
  'alpha',
  'gamut',
  'contrast-on-white',
  'contrast-on-black',
]);

/** 仅在 HDR 实验开关开启时渲染; 已包含在默认字段表中。 */
export const HDR_FIELDS: readonly FieldId[] = Object.freeze([
  'ictcp',
  'jzazbz',
  'jzczhz',
  'rec2100-pq',
  'rec2100-hlg',
  'rec2100-linear',
]);

/** 全部字段。HDR 字段已在默认表中, 这里去重。 */
export const ALL_FIELDS: readonly FieldId[] = Object.freeze([
  ...DEFAULT_FIELDS,
  ...OPTIONAL_FIELDS.filter((field) => !DEFAULT_FIELDS.includes(field)),
]);

/** 字段 → 序列化目标。仅适用于可直接序列化的字段。 */
const FIELD_TARGET: Partial<Record<FieldId, TargetFormat>> = {
  hex: 'hex',
  rgb: 'rgb',
  hsl: 'hsl',
  hwb: 'hwb',
  lab: 'lab',
  lch: 'lch',
  oklab: 'oklab',
  oklch: 'oklch',
  'display-p3': 'color-display-p3',
  'a98-rgb': 'color-a98-rgb',
  'prophoto-rgb': 'color-prophoto-rgb',
  rec2020: 'color-rec2020',
  'xyz-d50': 'color-xyz-d50',
  'xyz-d65': 'color-xyz-d65',
  ictcp: 'ictcp',
  jzazbz: 'jzazbz',
  jzczhz: 'jzczhz',
  'rec2100-pq': 'color-rec2100-pq',
  'rec2100-hlg': 'color-rec2100-hlg',
  'rec2100-linear': 'color-rec2100-linear',
};

export function fieldTarget(field: FieldId): TargetFormat | undefined {
  return FIELD_TARGET[field];
}

/** 计算字段值; 返回 undefined 表示该字段对当前颜色无内容。 */
export function fieldValue(
  field: FieldId,
  resolved: ResolvedColor,
  options: SerializerOptions,
): string | undefined {
  const target = fieldTarget(field);
  if (target) return serialize(resolved, target, options).text;

  switch (field) {
    case 'alpha':
      return formatNumber(resolved.alpha, Math.max(options.precision, 2));
    case 'gamut': {
      const gamut = describeGamut(resolved);
      const spaces: string[] = [];
      if (gamut.srgb) spaces.push('srgb');
      if (gamut.displayP3) spaces.push('display-p3');
      if (gamut.rec2020) spaces.push('rec2020');
      return spaces.length > 0 ? spaces.join(', ') : 'outside rec2020';
    }
    case 'hsv': {
      const { coords } = convertTo(resolved, 'hsv');
      return `hsv(${coords.map((value) => formatNumber(value, options.precision)).join(' ')})`;
    }
    case 'cmyk': {
      // 非 CSS 的展示用 naive CMYK, 与 device-cmyk() 的 fallback 公式互逆。
      const { coords } = convertTo(resolved, 'srgb');
      const k = 1 - Math.max(coords[0], coords[1], coords[2]);
      const denominator = 1 - k;
      const channel = (value: number): number =>
        denominator === 0 ? 0 : (1 - value - k) / denominator;
      const values = [channel(coords[0]), channel(coords[1]), channel(coords[2]), k];
      return `cmyk(${values.map((value) => formatNumber(value, options.precision)).join(' ')})`;
    }
    case 'css-color-name': {
      const { coords } = convertTo(resolved, 'srgb');
      return exactNamedColor(coords);
    }
    case 'contrast-on-white':
      return formatNumber(contrastAgainstExtremes(resolved).onWhite, 3);
    case 'contrast-on-black':
      return formatNumber(contrastAgainstExtremes(resolved).onBlack, 3);
    default:
      return undefined;
  }
}

/**
 * 计算最终字段顺序: `fields` 为 null 时用默认顺序, 再减去 `excludedFields`。
 * HDR 字段在实验开关关闭时被过滤掉, 因此默认表里带 HDR 字段也不会在关闭状态下渲染。
 */
export function resolveFieldOrder(
  fields: readonly string[] | null,
  excluded: readonly string[],
  hdrEnabled: boolean,
): readonly FieldId[] {
  const hdrSet = new Set<string>(HDR_FIELDS);
  const allowed = new Set<string>(
    hdrEnabled ? ALL_FIELDS : ALL_FIELDS.filter((field) => !hdrSet.has(field)),
  );
  const excludedSet = new Set(excluded);
  const requested = fields ?? DEFAULT_FIELDS;
  const out: FieldId[] = [];
  for (const field of requested) {
    if (!allowed.has(field)) continue;
    if (excludedSet.has(field)) continue;
    if (out.includes(field as FieldId)) continue;
    out.push(field as FieldId);
  }
  return out;
}
