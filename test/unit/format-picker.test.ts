/**
 * Quick Pick 条目列表的结构断言。
 *
 * `buildTargetItems` 是纯函数, 但它引用 `vscode`, 因此这里用 vitest 的模块打桩,
 * 只替换掉真正用到的 `QuickPickItemKind` 与 `window`, 其余保持未定义以暴露意外依赖。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  QuickPickItemKind: { Separator: -1, Default: 0 },
  window: { showQuickPick: vi.fn() },
  l10n: { t: (text: string) => text },
}));

import { FORMAT_CATALOG, FORMAT_CATEGORIES } from '../../src/features/convert/format-catalog.js';
import { RUNTIME_STRINGS } from '../../src/l10n/runtime-strings.js';
import type { RuntimeConfiguration } from '../../src/configuration/load.js';
import type { ResolvedColor, SerializerOptions } from '../../src/core/types.js';
import type { TargetFormat } from '../../src/core/serializer.js';
import type { ConvertPolicy } from '../../src/features/convert/presentations.js';

import { resolvedOf } from './helpers.js';

type BuildTargetItems = typeof import('../../src/features/convert/format-picker.js')['buildTargetItems'];

let buildTargetItems: BuildTargetItems;

const SERIALIZE: SerializerOptions = {
  precision: 5,
  hexCase: 'lower',
  syntax: 'modern',
  gamutMapping: 'css',
  computeMissingComponents: false,
};

const POLICY: ConvertPolicy = {
  alphaLoss: 'reject',
  missingComponentLoss: 'confirm',
  namedColorFallback: 'nearest',
  allowAssumedContextual: false,
};

function options(overrides: {
  cssColorHdr?: boolean;
  recentFirst?: boolean;
  recent?: TargetFormat[];
  resolved?: ResolvedColor;
}) {
  const recent = overrides.recent ?? [];
  return {
    titleKey: 'quickPick.convertTitle' as const,
    resolved: overrides.resolved ?? resolvedOf('#ff8800'),
    serializerOptions: SERIALIZE,
    policy: POLICY,
    config: {
      cssColorHdr: overrides.cssColorHdr ?? false,
      recentFirst: overrides.recentFirst ?? true,
    } as unknown as RuntimeConfiguration,
    recent: { get: () => recent, push: async () => {} },
    currentText: '#ff8800',
  };
}

const SEPARATOR = -1;

/**
 * `t()` 返回的是英语默认文案 (打桩的 `l10n.t` 原样返回模板), 不是 key。
 * 这里统一通过 `RUNTIME_STRINGS` 取值, 文案改动不会让断言失效。
 */
function label(key: keyof typeof RUNTIME_STRINGS): string {
  return RUNTIME_STRINGS[key];
}

beforeAll(async () => {
  ({ buildTargetItems } = await import('../../src/features/convert/format-picker.js'));
});

describe('一级分组 Quick Pick', () => {
  it('全部目标格式平铺在同一层, 没有二级菜单', () => {
    const items = buildTargetItems(options({}));
    const targets = items.filter((item) => item.target !== undefined);
    const nonExperimental = FORMAT_CATALOG.filter((entry) => !entry.experimental);
    expect(targets).toHaveLength(nonExperimental.length);
    expect(targets.map((item) => item.target)).toEqual(nonExperimental.map((entry) => entry.target));
  });

  it('没有"返回上一级"这类导航条目', () => {
    const items = buildTargetItems(options({}));
    for (const item of items) {
      if (item.kind === SEPARATOR) continue;
      expect(item.target, `${item.label} 应该是一个可选目标`).toBeDefined();
    }
  });

  it('用分隔符按分类分组, 分隔符后紧跟该分类的目标', () => {
    const items = buildTargetItems(options({}));
    const separators = items.filter((item) => item.kind === SEPARATOR);
    const visibleCategories = FORMAT_CATEGORIES.filter((category) => !category.experimental);
    expect(separators).toHaveLength(visibleCategories.length);
    expect(separators.map((item) => item.label)).toEqual(
      visibleCategories.map((category) => label(category.nlsKey as keyof typeof RUNTIME_STRINGS)),
    );
  });

  it('第一个条目是分隔符, 保证列表以分组开头', () => {
    expect(buildTargetItems(options({}))[0].kind).toBe(SEPARATOR);
  });

  it('HDR 分类与其目标只在实验开关开启时出现', () => {
    const closed = buildTargetItems(options({}));
    expect(closed.some((item) => item.target === 'ictcp')).toBe(false);
    expect(closed.some((item) => item.label === label('quickPick.categoryHdr'))).toBe(false);

    const open = buildTargetItems(options({ cssColorHdr: true }));
    expect(open.some((item) => item.target === 'ictcp')).toBe(true);
    expect(open.some((item) => item.label === label('quickPick.categoryHdr'))).toBe(true);
    expect(open.filter((item) => item.target !== undefined)).toHaveLength(FORMAT_CATALOG.length);
  });

  it('最近使用置顶, 且不影响后续分组的完整性', () => {
    const items = buildTargetItems(options({ recent: ['oklch', 'hex'] }));
    expect(items[0].label).toBe(label('ui.recentlyUsed'));
    expect(items[1].target).toBe('oklch');
    expect(items[2].target).toBe('hex');
    // 最近使用是重复展示, 不从原分组中移除。
    const nonExperimental = FORMAT_CATALOG.filter((entry) => !entry.experimental).length;
    expect(items.filter((item) => item.target !== undefined)).toHaveLength(nonExperimental + 2);
  });

  it('recentFirst 关闭时不出现最近使用分组', () => {
    const items = buildTargetItems(options({ recent: ['oklch'], recentFirst: false }));
    expect(items.some((item) => item.label === label('ui.recentlyUsed'))).toBe(false);
  });

  it('最近使用里的 HDR 目标在开关关闭时被过滤', () => {
    const items = buildTargetItems(options({ recent: ['ictcp'] }));
    expect(items.some((item) => item.label === label('ui.recentlyUsed'))).toBe(false);
    expect(items.some((item) => item.target === 'ictcp')).toBe(false);
  });

  it('每个目标条目都带转换后预览文本, 便于输入过滤', () => {
    const items = buildTargetItems(options({}));
    for (const item of items) {
      if (item.target === undefined) continue;
      expect(item.description, `${item.label} 缺少预览`).toBeTruthy();
    }
    expect(items.find((item) => item.target === 'hex')?.description).toBe('#ff8800');
    expect(items.find((item) => item.target === 'rgb')?.description).toBe('rgb(255 136 0)');
  });

  it('已是当前格式的目标标注"无变化"', () => {
    const items = buildTargetItems(options({}));
    expect(items.find((item) => item.target === 'hex')?.detail).toContain(label('ui.noChange'));
  });

  it('广色域目标标注色域映射', () => {
    const items = buildTargetItems(options({ resolved: resolvedOf('color(display-p3 0 1 0)') }));
    expect(items.find((item) => item.target === 'hex')?.detail).toContain(label('ui.gamutMapped'));
  });
});
