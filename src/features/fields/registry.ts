/**
 * 颜色字段注册表: 高亮与 Hover 的唯一范围来源。
 *
 * 一份字段列表同时决定两件事, 因此不再需要为高亮单独配置一遍:
 * - Hover 渲染哪些行, 按什么顺序 (`resolveHoverFields`);
 * - 高亮装饰哪些源语法 (`resolveHighlightSyntaxes`)。
 *
 * 字段 id 与 `advanced` 的 `fields.enabled` / `fields.excluded` 枚举一一对应;
 * 二者同时命中同一字段时 `fields.excluded` 优先。
 *
 * 三类字段用 `scope` 区分, Quick Pick 按 `group` 分节展示:
 * - `both`: 既是可写出的目标格式, 又是可识别的源语法;
 * - `highlight`: 只能作为源语法出现, 无法作为 Hover 的输出格式
 *   (例如 `color-mix()`、相对颜色、`light-dark()`、系统色);
 * - `hover`: 只出现在 Hover 中, 其中 `meta` 组的条目不构成完整颜色
 *   (预览色块、原始语法、alpha、色域、对比度、规范层级、解析说明)。
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
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'color-srgb'
  | 'color-srgb-linear'
  | 'display-p3'
  | 'color-display-p3-linear'
  | 'a98-rgb'
  | 'prophoto-rgb'
  | 'rec2020'
  | 'xyz-d50'
  | 'xyz-d65'
  | 'ictcp'
  | 'jzazbz'
  | 'jzczhz'
  | 'rec2100-pq'
  | 'rec2100-hlg'
  | 'rec2100-linear'
  | 'css-color-name'
  | 'transparent'
  | 'color-mix'
  | 'relative-color'
  | 'contrast-color'
  | 'color-layers'
  | 'light-dark'
  | 'device-cmyk'
  | 'color-custom-profile'
  | 'current-color'
  | 'system-color'
  | 'hdr-color'
  | 'hsv'
  | 'cmyk'
  | 'alpha'
  | 'gamut'
  | 'contrast-on-white'
  | 'contrast-on-black'
  | 'spec-level'
  | 'diagnostics';

/** `both` 同时作用于 Hover 与高亮; 另两种只作用于其中一侧。 */
export type FieldScope = 'both' | 'highlight' | 'hover';

/**
 * Quick Pick 的分节。
 * - `css-format`: CSS 语法, 既能读也能写;
 * - `css-syntax`: CSS 语法, 只能读 (无法作为 Hover 输出);
 * - `non-css-format`: 完整颜色但不是 CSS 语法, 只出现在 Hover;
 * - `meta`: 不构成完整颜色的附加信息, 只出现在 Hover。
 */
export type FieldGroup = 'css-format' | 'css-syntax' | 'non-css-format' | 'meta';

export interface FieldDefinition {
  readonly id: FieldId;
  readonly scope: FieldScope;
  readonly group: FieldGroup;
  /** 序列化目标; 只有可直接写出的格式字段有。 */
  readonly target?: TargetFormat;
  /** 本字段覆盖的 `ColorMatch.syntax` 值; `scope` 含高亮时用于装饰过滤。 */
  readonly syntaxes?: readonly string[];
  /** 前缀形式的语法, 用于 `relative-<space>` 这类按空间派生的 syntax。 */
  readonly syntaxPrefixes?: readonly string[];
  /** 需要 `cssColorHdr` 实验开关。 */
  readonly hdr?: boolean;
  /** 默认关闭, 需要时显式加入 `fields.enabled`。 */
  readonly optional?: boolean;
}

/**
 * 字段全表, 数组顺序即默认顺序。
 *
 * 顺序: 预览与原始语法 → 常用 CSS 格式 → 感知空间 → `color()` 预定义空间 →
 * HDR 空间 (仅 HDR 开关开启时生效) → 关键字与只读语法 → 非 CSS 辅助表示 → 元信息。
 *
 * 默认开启除 `alpha`、`gamut`、`contrast-on-white`、`contrast-on-black` 之外的全部字段。
 * 这四项被排除的理由: alpha 已经体现在各格式的序列化结果里 (例如 `#ff880080`、`rgba(...)`),
 * gamut 与两个对比度是诊断性信息, 日常查看颜色时属于噪音。需要时在
 * `advanced` 的 `fields.enabled` 中加回, 或用"配置颜色字段"命令勾选。
 */
export const FIELDS: readonly FieldDefinition[] = Object.freeze([
  { id: 'preview', scope: 'hover', group: 'meta' },
  { id: 'source', scope: 'hover', group: 'meta' },

  { id: 'hex', scope: 'both', group: 'css-format', target: 'hex', syntaxes: ['hex'] },
  // legacy 逗号语法与 modern 空格语法共用一个字段: 两者是同一格式的两种写法。
  { id: 'rgb', scope: 'both', group: 'css-format', target: 'rgb', syntaxes: ['srgb', 'legacy-rgb'] },
  { id: 'hsl', scope: 'both', group: 'css-format', target: 'hsl', syntaxes: ['hsl', 'legacy-hsl'] },
  { id: 'hwb', scope: 'both', group: 'css-format', target: 'hwb', syntaxes: ['hwb'] },
  { id: 'lab', scope: 'both', group: 'css-format', target: 'lab', syntaxes: ['lab'] },
  { id: 'lch', scope: 'both', group: 'css-format', target: 'lch', syntaxes: ['lch'] },
  { id: 'oklab', scope: 'both', group: 'css-format', target: 'oklab', syntaxes: ['oklab'] },
  { id: 'oklch', scope: 'both', group: 'css-format', target: 'oklch', syntaxes: ['oklch'] },
  {
    id: 'color-srgb',
    scope: 'both',
    group: 'css-format',
    target: 'color-srgb',
    syntaxes: ['color-srgb'],
  },
  {
    id: 'color-srgb-linear',
    scope: 'both',
    group: 'css-format',
    target: 'color-srgb-linear',
    syntaxes: ['color-srgb-linear'],
  },
  {
    id: 'display-p3',
    scope: 'both',
    group: 'css-format',
    target: 'color-display-p3',
    syntaxes: ['color-display-p3'],
  },
  {
    id: 'color-display-p3-linear',
    scope: 'both',
    group: 'css-format',
    target: 'color-display-p3-linear',
    syntaxes: ['color-display-p3-linear'],
  },
  {
    id: 'a98-rgb',
    scope: 'both',
    group: 'css-format',
    target: 'color-a98-rgb',
    syntaxes: ['color-a98-rgb'],
  },
  {
    id: 'prophoto-rgb',
    scope: 'both',
    group: 'css-format',
    target: 'color-prophoto-rgb',
    syntaxes: ['color-prophoto-rgb'],
  },
  {
    id: 'rec2020',
    scope: 'both',
    group: 'css-format',
    target: 'color-rec2020',
    syntaxes: ['color-rec2020'],
  },
  {
    id: 'xyz-d50',
    scope: 'both',
    group: 'css-format',
    target: 'color-xyz-d50',
    syntaxes: ['color-xyz-d50'],
  },
  {
    id: 'xyz-d65',
    scope: 'both',
    group: 'css-format',
    target: 'color-xyz-d65',
    syntaxes: ['color-xyz-d65'],
  },

  { id: 'ictcp', scope: 'both', group: 'css-format', target: 'ictcp', syntaxes: ['ictcp'], hdr: true },
  { id: 'jzazbz', scope: 'both', group: 'css-format', target: 'jzazbz', syntaxes: ['jzazbz'], hdr: true },
  { id: 'jzczhz', scope: 'both', group: 'css-format', target: 'jzczhz', syntaxes: ['jzczhz'], hdr: true },
  {
    id: 'rec2100-pq',
    scope: 'both',
    group: 'css-format',
    target: 'color-rec2100-pq',
    syntaxes: ['color-rec2100-pq'],
    hdr: true,
  },
  {
    id: 'rec2100-hlg',
    scope: 'both',
    group: 'css-format',
    target: 'color-rec2100-hlg',
    syntaxes: ['color-rec2100-hlg'],
    hdr: true,
  },
  {
    id: 'rec2100-linear',
    scope: 'both',
    group: 'css-format',
    target: 'color-rec2100-linear',
    syntaxes: ['color-rec2100-linear'],
    hdr: true,
  },

  // 关键字。颜色名的 Hover 值只在精确匹配时显示, 因此不走 `target`
  // (`serialize(..., 'named-color')` 会给出最近似的名字, 那是转换命令的语义)。
  { id: 'css-color-name', scope: 'both', group: 'css-format', syntaxes: ['named-color'] },
  { id: 'transparent', scope: 'highlight', group: 'css-syntax', syntaxes: ['transparent'] },

  // 只读语法: 无法作为 Hover 的输出格式, 只决定是否高亮。
  {
    id: 'color-mix',
    scope: 'highlight',
    group: 'css-syntax',
    syntaxes: ['color-mix', 'color-mix-variadic'],
  },
  {
    id: 'relative-color',
    scope: 'highlight',
    group: 'css-syntax',
    // `relative-<space>` 随原点空间派生, 因此按前缀匹配; `alpha()` 是相对 alpha 形式。
    syntaxes: ['alpha'],
    syntaxPrefixes: ['relative-'],
  },
  {
    id: 'contrast-color',
    scope: 'highlight',
    group: 'css-syntax',
    syntaxes: ['contrast-color', 'contrast-color-ext'],
  },
  { id: 'color-layers', scope: 'highlight', group: 'css-syntax', syntaxes: ['color-layers'] },
  { id: 'light-dark', scope: 'highlight', group: 'css-syntax', syntaxes: ['light-dark'] },
  { id: 'device-cmyk', scope: 'highlight', group: 'css-syntax', syntaxes: ['device-cmyk'] },
  {
    id: 'color-custom-profile',
    scope: 'highlight',
    group: 'css-syntax',
    syntaxes: ['color-custom-profile'],
  },
  { id: 'current-color', scope: 'highlight', group: 'css-syntax', syntaxes: ['current-color'] },
  {
    id: 'system-color',
    scope: 'highlight',
    group: 'css-syntax',
    syntaxes: ['system-color', 'deprecated-system-color'],
  },
  { id: 'hdr-color', scope: 'highlight', group: 'css-syntax', syntaxes: ['hdr-color'], hdr: true },

  { id: 'hsv', scope: 'hover', group: 'non-css-format' },
  { id: 'cmyk', scope: 'hover', group: 'non-css-format' },

  { id: 'spec-level', scope: 'hover', group: 'meta' },
  { id: 'diagnostics', scope: 'hover', group: 'meta' },
  { id: 'alpha', scope: 'hover', group: 'meta', optional: true },
  { id: 'gamut', scope: 'hover', group: 'meta', optional: true },
  { id: 'contrast-on-white', scope: 'hover', group: 'meta', optional: true },
  { id: 'contrast-on-black', scope: 'hover', group: 'meta', optional: true },
]);

const byId = new Map<string, FieldDefinition>(FIELDS.map((field) => [field.id, field]));

export function fieldDefinition(id: string): FieldDefinition | undefined {
  return byId.get(id);
}

/** 默认字段顺序: 全表减去默认关闭项。 */
export const DEFAULT_FIELDS: readonly FieldId[] = Object.freeze(
  FIELDS.filter((field) => !field.optional).map((field) => field.id),
);

/** 默认关闭, 需要时显式加入 `fields.enabled`。 */
export const OPTIONAL_FIELDS: readonly FieldId[] = Object.freeze(
  FIELDS.filter((field) => field.optional).map((field) => field.id),
);

/** 仅在 HDR 实验开关开启时生效。 */
export const HDR_FIELDS: readonly FieldId[] = Object.freeze(
  FIELDS.filter((field) => field.hdr).map((field) => field.id),
);

/** 全部字段, 默认项在前。 */
export const ALL_FIELDS: readonly FieldId[] = Object.freeze([...DEFAULT_FIELDS, ...OPTIONAL_FIELDS]);

export function fieldTarget(field: FieldId): TargetFormat | undefined {
  return byId.get(field)?.target;
}

/**
 * 源语法对应的可写目标格式; 只读语法返回 undefined。
 * 用于"按原格式写回" (原生取色器的 ColorPresentation)。
 */
export function targetForSyntax(syntax: string): TargetFormat | undefined {
  for (const field of FIELDS) {
    if (!field.target) continue;
    if (field.syntaxes?.includes(syntax)) return field.target;
  }
  return undefined;
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
 * 解析出用户启用的字段: `fields` 为 null 时用默认顺序, 再减去 `excluded`。
 * HDR 字段在实验开关关闭时被过滤掉, 因此默认表里带 HDR 字段也不会在关闭状态下生效。
 */
export function resolveEnabledFields(
  fields: readonly string[] | null,
  excluded: readonly string[],
  hdrEnabled: boolean,
): readonly FieldDefinition[] {
  const excludedSet = new Set(excluded);
  const requested = fields ?? DEFAULT_FIELDS;
  const out: FieldDefinition[] = [];
  const seen = new Set<string>();
  for (const id of requested) {
    if (excludedSet.has(id) || seen.has(id)) continue;
    const definition = byId.get(id);
    if (!definition) continue;
    if (definition.hdr && !hdrEnabled) continue;
    seen.add(id);
    out.push(definition);
  }
  return out;
}

/**
 * Hover 的最终字段顺序。
 * 只读语法字段 (`scope: 'highlight'`) 不参与 Hover 渲染。
 */
export function resolveHoverFields(
  fields: readonly string[] | null,
  excluded: readonly string[],
  hdrEnabled: boolean,
): readonly FieldId[] {
  return resolveEnabledFields(fields, excluded, hdrEnabled)
    .filter((field) => field.scope !== 'highlight')
    .map((field) => field.id);
}

/** 高亮的语法过滤器。 */
export interface SyntaxFilter {
  allows(syntax: string): boolean;
}

/**
 * 高亮允许的源语法。
 *
 * 未登记在注册表中的 syntax 一律放行: 解析器新增语法时应当默认可见,
 * 而不是因为字段表没跟上就静默失去高亮。
 */
export function resolveHighlightSyntaxes(
  fields: readonly string[] | null,
  excluded: readonly string[],
  hdrEnabled: boolean,
): SyntaxFilter {
  const allowed = new Set<string>();
  const allowedPrefixes: string[] = [];
  for (const field of resolveEnabledFields(fields, excluded, hdrEnabled)) {
    if (field.scope === 'hover') continue;
    for (const syntax of field.syntaxes ?? []) allowed.add(syntax);
    for (const prefix of field.syntaxPrefixes ?? []) allowedPrefixes.push(prefix);
  }

  return {
    allows(syntax: string): boolean {
      if (allowed.has(syntax)) return true;
      if (allowedPrefixes.some((prefix) => syntax.startsWith(prefix))) return true;
      return !isRegisteredSyntax(syntax);
    },
  };
}

const registeredSyntaxes = new Set<string>();
const registeredPrefixes: string[] = [];
for (const field of FIELDS) {
  for (const syntax of field.syntaxes ?? []) registeredSyntaxes.add(syntax);
  for (const prefix of field.syntaxPrefixes ?? []) registeredPrefixes.push(prefix);
}

/** 该 syntax 是否被某个字段登记过 (无论启用与否)。 */
export function isRegisteredSyntax(syntax: string): boolean {
  if (registeredSyntaxes.has(syntax)) return true;
  return registeredPrefixes.some((prefix) => syntax.startsWith(prefix));
}
