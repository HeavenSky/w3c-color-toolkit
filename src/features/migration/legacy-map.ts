/**
 * 旧配置到新配置的映射表。
 *
 * 数据来源: 2026-08-04 从三个参考仓库的 `package.json` 读出的真实键。
 * `color-highlight` 11 个键, `colorInfo` 3 个键, `change-color-format` 无配置键。
 *
 * 目标分两层: 暴露层顶层键, 或 `w3cColorToolkit.advanced` 内的点分键。
 */

export type TargetTier = 'exposed' | 'advanced';

export interface LegacyMapping {
  readonly legacyKey: string;
  /** 不含 `w3cColorToolkit.` 前缀。 */
  readonly targetKey: string;
  readonly tier: TargetTier;
  /** 值转换; 返回 undefined 表示该值不迁移。 */
  readonly transform?: (value: unknown) => unknown;
  /** 不迁移时的说明 key。 */
  readonly note?: string;
}

/** `color-highlight.*` */
export const COLOR_HIGHLIGHT_MAPPINGS: readonly LegacyMapping[] = Object.freeze([
  // enable 与 markerType 合并为单个 `highlight` 键, 由 mergeHighlight 单独处理。
  { legacyKey: 'color-highlight.languages', targetKey: 'languages', tier: 'exposed' },
  {
    legacyKey: 'color-highlight.matchWords',
    targetKey: 'highlight.matchWords',
    tier: 'advanced',
    transform: (value) => (value === true ? 'all' : 'off'),
  },
  {
    legacyKey: 'color-highlight.useARGB',
    targetKey: 'highlight.hexAlphaOrder',
    tier: 'advanced',
    transform: (value) => (value === true ? 'argb' : 'rgba'),
  },
  {
    legacyKey: 'color-highlight.matchRgbWithNoFunction',
    targetKey: 'highlight.matchRgbWithoutFunction',
    tier: 'advanced',
  },
  {
    legacyKey: 'color-highlight.rgbWithNoFunctionLanguages',
    targetKey: 'highlight.rgbWithoutFunctionLanguages',
    tier: 'advanced',
  },
  {
    legacyKey: 'color-highlight.matchHslWithNoFunction',
    targetKey: 'highlight.matchHslWithoutFunction',
    tier: 'advanced',
  },
  {
    legacyKey: 'color-highlight.hslWithNoFunctionLanguages',
    targetKey: 'highlight.hslWithoutFunctionLanguages',
    tier: 'advanced',
  },
  { legacyKey: 'color-highlight.markRuler', targetKey: 'highlight.markRuler', tier: 'advanced' },
  {
    legacyKey: 'color-highlight.sass.includePaths',
    targetKey: 'variables.includePaths',
    tier: 'advanced',
    // 绝对路径与工作区外路径不迁移。
    transform: (value) => {
      if (!Array.isArray(value)) return undefined;
      const kept = value.filter(
        (item): item is string =>
          typeof item === 'string' && !item.startsWith('/') && !item.includes('..'),
      );
      return kept.length > 0 ? kept : undefined;
    },
    note: 'migration.skippedNoTarget',
  },
]);

/** 旧 `colorInfo` 的 4 个 preview 变体折叠为 `preview` 字段加尺寸/形状。 */
export const PREVIEW_FIELD_COLLAPSE: Readonly<
  Record<string, { readonly size: 'small' | 'large'; readonly shape: 'square' | 'rectangle' }>
> = Object.freeze({
  preview: { size: 'small', shape: 'rectangle' },
  'preview-xl': { size: 'large', shape: 'rectangle' },
  'preview-square': { size: 'small', shape: 'square' },
  'preview-square-xl': { size: 'large', shape: 'square' },
});

export interface CollapsedFields {
  readonly fields: readonly string[];
  readonly previewSize: 'small' | 'large';
  readonly previewShape: 'square' | 'rectangle';
  readonly collapsed: boolean;
}

/**
 * 折叠 preview 字段。
 * 同时出现多个变体时取尺寸和形状的最大集 (`large`, `square`)。
 */
export function collapsePreviewFields(fields: readonly string[]): CollapsedFields {
  const out: string[] = [];
  let previewSize: 'small' | 'large' = 'small';
  let previewShape: 'square' | 'rectangle' = 'rectangle';
  let collapsed = false;
  let previewAdded = false;

  for (const field of fields) {
    const collapse = PREVIEW_FIELD_COLLAPSE[field];
    if (!collapse) {
      if (!out.includes(field)) out.push(field);
      continue;
    }
    collapsed = true;
    if (collapse.size === 'large') previewSize = 'large';
    if (collapse.shape === 'square') previewShape = 'square';
    if (!previewAdded) {
      out.push('preview');
      previewAdded = true;
    }
  }

  return { fields: out, previewSize, previewShape, collapsed };
}

/**
 * `color-highlight.enable` + `markerType` → 单个 `highlight` 键。
 *
 * | enable | markerType | highlight |
 * | --- | --- | --- |
 * | false | 任意 | off |
 * | true 或未设置 | 已显式设置 | 该 marker 值 |
 * | true | 未设置 | background |
 */
export function mergeHighlight(
  enable: unknown,
  markerType: unknown,
): string | undefined {
  if (enable === false) return 'off';
  if (typeof markerType === 'string') return markerType;
  if (enable === true) return 'background';
  return undefined;
}

/** `colorInfo.languages` 的 selector 去重; `colors` 子字段没有新对应项。 */
export function collectColorInfoLanguages(value: unknown): {
  readonly selectors: readonly string[];
  readonly ignoredColorsField: boolean;
} {
  if (!Array.isArray(value)) return { selectors: [], ignoredColorsField: false };
  const selectors: string[] = [];
  let ignoredColorsField = false;
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.selector === 'string' && !selectors.includes(record.selector)) {
      selectors.push(record.selector);
    }
    if ('colors' in record) ignoredColorsField = true;
  }
  return { selectors, ignoredColorsField };
}

/** 旧命令 → 新命令。 */
export const LEGACY_COMMAND_MAP: Readonly<Record<string, string>> = Object.freeze({
  'extension.changeColorFormat.commands': 'w3cColorToolkit.convert',
  'extension.changeColorFormat.hexSmartConvert': 'w3cColorToolkit.convertTo.hex',
  'extension.changeColorFormat.hslSmartConvert': 'w3cColorToolkit.convertTo.hsl',
  'extension.changeColorFormat.rgbSmartConvert': 'w3cColorToolkit.convertTo.rgb',
  'extension.colorHighlight': 'w3cColorToolkit.toggleFeatures',
});

/** 旧插件的 extension id, 用于共存检测。 */
export const LEGACY_EXTENSION_IDS: readonly string[] = Object.freeze([
  'bbugh.change-color-format',
  'naumovs.color-highlight',
  'bierner.color-info',
]);
