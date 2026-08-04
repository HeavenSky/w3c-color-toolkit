/**
 * 迁移映射的纯函数部分。
 * 需要 vscode API 的写入流程由集成测试覆盖 (`test/vscode/`)。
 */
import { describe, expect, it } from 'vitest';

import {
  collapsePreviewFields,
  collectColorInfoLanguages,
  COLOR_HIGHLIGHT_MAPPINGS,
  LEGACY_COMMAND_MAP,
  LEGACY_EXTENSION_IDS,
  mergeHighlight,
  PREVIEW_FIELD_COLLAPSE,
} from '../../src/features/migration/legacy-map.js';
import { ADVANCED_KEYS, EXPOSED_KEYS } from '../../src/configuration/schema.js';

describe('旧配置键覆盖', () => {
  it('覆盖 color-highlight 的 9 个直接映射键 (enable 与 markerType 另行合并)', () => {
    expect(COLOR_HIGHLIGHT_MAPPINGS).toHaveLength(9);
  });

  it('每个映射的目标键都真实存在', () => {
    for (const mapping of COLOR_HIGHLIGHT_MAPPINGS) {
      const pool = mapping.tier === 'exposed' ? EXPOSED_KEYS : ADVANCED_KEYS;
      expect(pool, `${mapping.legacyKey} 的目标 ${mapping.targetKey} 不存在`).toContain(mapping.targetKey);
    }
  });

  it('11 个 color-highlight 旧键都被处理', () => {
    const handled = new Set([
      'color-highlight.enable',
      'color-highlight.markerType',
      ...COLOR_HIGHLIGHT_MAPPINGS.map((mapping) => mapping.legacyKey),
    ]);
    expect(handled).toEqual(
      new Set([
        'color-highlight.enable',
        'color-highlight.languages',
        'color-highlight.matchWords',
        'color-highlight.useARGB',
        'color-highlight.matchRgbWithNoFunction',
        'color-highlight.rgbWithNoFunctionLanguages',
        'color-highlight.matchHslWithNoFunction',
        'color-highlight.hslWithNoFunctionLanguages',
        'color-highlight.markerType',
        'color-highlight.markRuler',
        'color-highlight.sass.includePaths',
      ]),
    );
    expect(handled.size).toBe(11);
  });
});

describe('值转换', () => {
  it('matchWords: false → off, true → all', () => {
    const mapping = COLOR_HIGHLIGHT_MAPPINGS.find((item) => item.targetKey === 'highlight.matchWords')!;
    expect(mapping.transform?.(false)).toBe('off');
    expect(mapping.transform?.(true)).toBe('all');
  });

  it('useARGB: false → rgba, true → argb', () => {
    const mapping = COLOR_HIGHLIGHT_MAPPINGS.find((item) => item.targetKey === 'highlight.hexAlphaOrder')!;
    expect(mapping.transform?.(false)).toBe('rgba');
    expect(mapping.transform?.(true)).toBe('argb');
  });

  it('includePaths 丢弃绝对路径与工作区外路径', () => {
    const mapping = COLOR_HIGHLIGHT_MAPPINGS.find(
      (item) => item.targetKey === 'variables.includePaths',
    )!;
    expect(mapping.transform?.(['src/styles', '/abs/path', '../outside'])).toEqual(['src/styles']);
    expect(mapping.transform?.(['/abs/path'])).toBeUndefined();
  });
});

describe('enable 与 markerType 合并', () => {
  it('enable = false 一律得到 off', () => {
    expect(mergeHighlight(false, 'outline')).toBe('off');
    expect(mergeHighlight(false, undefined)).toBe('off');
  });

  it('已显式设置 markerType 时取该值', () => {
    expect(mergeHighlight(true, 'underline')).toBe('underline');
    expect(mergeHighlight(undefined, 'dot-before')).toBe('dot-before');
  });

  it('enable = true 且未设置 markerType 时取 background', () => {
    expect(mergeHighlight(true, undefined)).toBe('background');
  });

  it('两个键都未设置时不迁移', () => {
    expect(mergeHighlight(undefined, undefined)).toBeUndefined();
  });
});

describe('colorInfo preview 字段折叠', () => {
  it('四个变体都有折叠规则', () => {
    expect(Object.keys(PREVIEW_FIELD_COLLAPSE)).toEqual([
      'preview',
      'preview-xl',
      'preview-square',
      'preview-square-xl',
    ]);
  });

  it.each([
    ['preview', 'small', 'rectangle'],
    ['preview-xl', 'large', 'rectangle'],
    ['preview-square', 'small', 'square'],
    ['preview-square-xl', 'large', 'square'],
  ] as const)('%s → preview + %s + %s', (field, size, shape) => {
    const result = collapsePreviewFields([field, 'hex']);
    expect(result.fields).toEqual(['preview', 'hex']);
    expect(result.previewSize).toBe(size);
    expect(result.previewShape).toBe(shape);
    expect(result.collapsed).toBe(true);
  });

  it('多个变体共存时取最大集 (large, square)', () => {
    const result = collapsePreviewFields(['preview', 'preview-square', 'preview-xl']);
    expect(result.fields).toEqual(['preview']);
    expect(result.previewSize).toBe('large');
    expect(result.previewShape).toBe('square');
  });

  it('没有 preview 字段时不标记折叠', () => {
    const result = collapsePreviewFields(['hex', 'rgb']);
    expect(result.collapsed).toBe(false);
    expect(result.fields).toEqual(['hex', 'rgb']);
  });

  it('去重且保持顺序', () => {
    expect(collapsePreviewFields(['hex', 'hex', 'rgb']).fields).toEqual(['hex', 'rgb']);
  });
});

describe('colorInfo.languages', () => {
  it('取 selector 并去重', () => {
    const result = collectColorInfoLanguages([
      { selector: 'css', colors: 'css' },
      { selector: 'scss', colors: 'css' },
      { selector: 'css', colors: 'css' },
    ]);
    expect(result.selectors).toEqual(['css', 'scss']);
  });

  it('标记 colors 子字段被忽略', () => {
    expect(collectColorInfoLanguages([{ selector: 'css', colors: 'css' }]).ignoredColorsField).toBe(true);
    expect(collectColorInfoLanguages([{ selector: 'css' }]).ignoredColorsField).toBe(false);
  });

  it('非数组输入安全返回空结果', () => {
    expect(collectColorInfoLanguages('nonsense').selectors).toEqual([]);
  });
});

describe('旧命令与扩展 id', () => {
  it('5 个旧命令都有新对应项', () => {
    expect(Object.keys(LEGACY_COMMAND_MAP)).toHaveLength(5);
    expect(LEGACY_COMMAND_MAP['extension.colorHighlight']).toBe('w3cColorToolkit.toggleFeatures');
    expect(LEGACY_COMMAND_MAP['extension.changeColorFormat.hexSmartConvert']).toBe(
      'w3cColorToolkit.convertTo.hex',
    );
  });

  it('共存检测覆盖三个旧扩展', () => {
    expect(LEGACY_EXTENSION_IDS).toEqual([
      'bbugh.change-color-format',
      'naumovs.color-highlight',
      'bierner.color-info',
    ]);
  });
});
