/**
 * 颜色字段注册表: Hover 与高亮共用同一范围。
 *
 * 关键断言是"扫描器能产出的每个 syntax 都被某个字段登记":
 * 少登记一个语法, 用户就无法在"配置颜色字段"里看到它, 而它仍然会被高亮,
 * 两侧范围就再次分叉 — 这正是本次改造要消除的问题。
 */
import { describe, expect, it } from 'vitest';

import { scanText, type ScanOptions } from '../../src/core/scanner.js';
import { colorPresentationTexts } from '../../src/features/convert/presentations.js';
import {
  DEFAULT_FIELDS,
  FIELDS,
  HDR_FIELDS,
  isRegisteredSyntax,
  resolveHighlightSyntaxes,
  resolveHoverFields,
  targetForSyntax,
  type FieldId,
} from '../../src/features/fields/registry.js';
import { previewSource, previewSrgb } from '../../src/features/highlight/preview-color.js';
import { planSwatches, rangeKey } from '../../src/features/picker/swatch-plan.js';
import { RUNTIME_STRINGS } from '../../src/l10n/runtime-strings.js';

import { resolvedOf } from './helpers.js';

/** 覆盖全部规范层级与全部解析分支的样本。 */
const SAMPLE = `
rebeccapurple
transparent
#f09
#ff0099
rgb(255, 0, 153)
rgb(255 0 153 / 80%)
hsl(150, 30%, 60%)
hsl(150 30% 60% / 80%)
hwb(12 50% 0%)
lab(50% 40 59.5)
lch(52.2% 72.2 50)
oklab(59% 0.1 0.1)
oklch(60% 0.15 50)
color(srgb 1 0.5 0)
color(srgb-linear 0.25 0.5 0.75)
color(display-p3 1 0.5 0)
color(display-p3-linear 0.25 0.5 0.75)
color(a98-rgb 1 0.5 0)
color(prophoto-rgb 1 0.5 0)
color(rec2020 1 0.5 0)
color(xyz-d50 0.2 0.3 0.4)
color(xyz-d65 0.2 0.3 0.4)
color(--brand 0.2 0.3 0.4)
color-mix(in oklch, red, blue)
color-mix(in oklch, red, blue, green)
hsl(from red 240deg s l)
lch(from blue calc(l + 20) c h)
alpha(red / 0.5)
contrast-color(red)
contrast-color(red wcag2)
color-layers(red, blue)
light-dark(white, black)
device-cmyk(0 81% 81% 30%)
currentColor
ButtonFace
ThreeDFace
ictcp(0.5 0 0)
jzazbz(0.5 0 0)
jzczhz(0.5 0.1 40)
color(rec2100-pq 0.5 0.5 0.5)
color(rec2100-hlg 0.5 0.5 0.5)
color(rec2100-linear 0.5 0.5 0.5)
hdr-color(oklch(0.5 0.1 40) 2)
`;

const OPTIONS: ScanOptions = {
  cssColor6: true,
  cssColorHdr: true,
  contextualPreview: 'off',
  hdrAssumedHeadroom: 0,
  matchWords: 'all',
  cssLikeLanguage: true,
  scanComments: true,
  scanStrings: true,
  maxMatches: 1000,
};

const matches = scanText(SAMPLE, OPTIONS).matches;
const scannedSyntaxes = [...new Set(matches.map((match) => match.syntax))].sort();

describe('字段注册表', () => {
  it('样本覆盖到足够多的语法', () => {
    expect(scannedSyntaxes.length).toBeGreaterThanOrEqual(30);
  });

  it('扫描器产出的每个 syntax 都被某个字段登记', () => {
    const unregistered = scannedSyntaxes.filter((syntax) => !isRegisteredSyntax(syntax));
    expect(unregistered, `未登记的语法: ${unregistered.join(', ')}`).toEqual([]);
  });

  it('字段 id 不重复, 且都有中英文文案', () => {
    const ids = FIELDS.map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(RUNTIME_STRINGS[`field.${id}`], `缺少 field.${id} 文案`).toBeTruthy();
    }
  });

  it('参与高亮的字段必须声明语法, 只读字段不得声明 target', () => {
    for (const field of FIELDS) {
      if (field.scope === 'hover') {
        expect(field.syntaxes ?? field.syntaxPrefixes, `${field.id} 不应声明语法`).toBeUndefined();
        continue;
      }
      const count = (field.syntaxes?.length ?? 0) + (field.syntaxPrefixes?.length ?? 0);
      expect(count, `${field.id} 缺少 syntaxes`).toBeGreaterThan(0);
      if (field.scope === 'highlight') expect(field.target, `${field.id} 不应有 target`).toBeUndefined();
    }
  });

  it('默认字段表包含全部非可选项', () => {
    expect(DEFAULT_FIELDS).toEqual(FIELDS.filter((field) => !field.optional).map((field) => field.id));
    expect(DEFAULT_FIELDS).not.toContain('alpha' as FieldId);
    expect(DEFAULT_FIELDS).not.toContain('gamut' as FieldId);
  });
});

describe('Hover 字段解析', () => {
  it('只读语法不出现在 Hover 中', () => {
    const hover = resolveHoverFields(null, [], true);
    for (const id of ['light-dark', 'color-mix', 'relative-color', 'system-color', 'transparent']) {
      expect(hover).not.toContain(id as FieldId);
    }
    expect(hover[0]).toBe('preview');
    expect(hover).toContain('hex' as FieldId);
  });

  it('新增的 color() 空间进入默认 Hover 字段', () => {
    const hover = resolveHoverFields(null, [], false);
    expect(hover).toContain('color-srgb' as FieldId);
    expect(hover).toContain('color-srgb-linear' as FieldId);
    expect(hover).toContain('color-display-p3-linear' as FieldId);
  });

  it('excluded 优先, 且顺序按请求列表', () => {
    expect(resolveHoverFields(['rgb', 'hex'], ['hex'], false)).toEqual(['rgb']);
    expect(resolveHoverFields(['rgb', 'hex'], [], false)).toEqual(['rgb', 'hex']);
  });

  it('HDR 字段随实验开关生效', () => {
    for (const id of HDR_FIELDS) {
      expect(resolveHoverFields(null, [], false)).not.toContain(id);
    }
    expect(resolveHoverFields(null, [], true)).toContain('ictcp' as FieldId);
  });

  it('未知 id 被忽略', () => {
    expect(resolveHoverFields(['hex', 'not-a-field'], [], false)).toEqual(['hex']);
  });
});

describe('高亮语法过滤', () => {
  it('默认放行样本中的每个可预览 match', () => {
    const filter = resolveHighlightSyntaxes(null, [], true);
    const blocked = matches
      .filter((match) => previewSource(match) && !filter.allows(match.syntax))
      .map((match) => match.raw);
    expect(blocked, `默认配置下被拦截: ${blocked.join(', ')}`).toEqual([]);
  });

  it('未登记语法放行, 已登记但未启用的语法拦截', () => {
    const filter = resolveHighlightSyntaxes(['hex'], [], true);
    expect(filter.allows('hex')).toBe(true);
    expect(filter.allows('some-future-syntax')).toBe(true);
    expect(filter.allows('oklch')).toBe(false);
  });

  it('关闭一个字段同时收窄 Hover 与高亮', () => {
    const filter = resolveHighlightSyntaxes(null, ['relative-color'], true);
    expect(filter.allows('relative-hsl')).toBe(false);
    expect(filter.allows('alpha')).toBe(false);
    expect(filter.allows('hsl')).toBe(true);
    expect(resolveHoverFields(null, ['oklch'], true)).not.toContain('oklch' as FieldId);
  });

  it('legacy 与 modern 写法共用同一个字段', () => {
    const filter = resolveHighlightSyntaxes(null, ['rgb'], true);
    expect(filter.allows('srgb')).toBe(false);
    expect(filter.allows('legacy-rgb')).toBe(false);
    // color(srgb ...) 是独立字段, 不受 rgb() 开关影响。
    expect(filter.allows('color-srgb')).toBe(true);
  });

  it('HDR 语法随实验开关关闭', () => {
    const filter = resolveHighlightSyntaxes(null, [], false);
    expect(filter.allows('ictcp')).toBe(false);
    expect(filter.allows('color-rec2100-pq')).toBe(false);
    expect(filter.allows('hdr-color')).toBe(false);
  });
});

describe('原生色块与取色器', () => {
  const OPTIONS = {
    precision: 5,
    hexCase: 'lower',
    syntax: 'legacy',
    gamutMapping: 'css',
    computeMissingComponents: false,
  } as const;

  it('预览色给出 0-1 的 sRGB 数值, 供 vscode.Color 使用', () => {
    const preview = previewSrgb(resolvedOf('#ff8800'), 'css', 'reinhard');
    expect(preview.coords[0]).toBeCloseTo(1, 5);
    expect(preview.coords[1]).toBeCloseTo(0x88 / 255, 3);
    expect(preview.coords[2]).toBeCloseTo(0, 5);
    expect(preview.alpha).toBe(1);
  });

  it('none alpha 按 1 处理, 不把 NaN 传给渲染层', () => {
    expect(previewSrgb(resolvedOf('rgb(255 0 0 / none)'), 'css', 'reinhard').alpha).toBe(1);
  });

  it('广色域颜色映射进 sRGB 后仍在 0-1 内', () => {
    const preview = previewSrgb(resolvedOf('color(display-p3 1 0 0)'), 'css', 'reinhard');
    for (const value of preview.coords) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('源语法映射到可写目标, 只读语法没有目标', () => {
    expect(targetForSyntax('legacy-rgb')).toBe('rgb');
    expect(targetForSyntax('srgb')).toBe('rgb');
    expect(targetForSyntax('color-srgb')).toBe('color-srgb');
    expect(targetForSyntax('oklch')).toBe('oklch');
    expect(targetForSyntax('color-mix')).toBeUndefined();
    expect(targetForSyntax('light-dark')).toBeUndefined();
  });

  it('候选写法以原格式开头, 其余为常用格式', () => {
    const texts = colorPresentationTexts(resolvedOf('#ff8800'), 'oklch', OPTIONS);
    expect(texts[0].startsWith('oklch(')).toBe(true);
    expect(texts).toContain('#ff8800');
    expect(texts.some((text) => text.startsWith('rgb('))).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('原格式未知时只给常用格式, 第一项是 hex', () => {
    const texts = colorPresentationTexts(resolvedOf('#ff8800'), undefined, OPTIONS);
    expect(texts[0]).toBe('#ff8800');
  });

  it('带 alpha 时跳过无法表达 alpha 的目标', () => {
    const texts = colorPresentationTexts(resolvedOf('#ff880080'), 'oklch', OPTIONS);
    // hex 用 #RRGGBBAA 表达 alpha, 因此保留; oklch 与 legacy rgba/hsla 也能表达。
    expect(texts).toContain('#ff880080');
    for (const text of texts) expect(text.startsWith('hwb(')).toBe(false);
  });
});

describe('色块上报计划', () => {
  const ALLOW_ALL = { allows: () => true, hasPreview: () => true, limit: 1000 };

  it('按字段表过滤语法', () => {
    const plan = planSwatches(matches, {
      ...ALLOW_ALL,
      allows: (syntax) => syntax === 'hex',
    });
    expect(plan.matches.every((match) => match.syntax === 'hex')).toBe(true);
    expect(plan.matches.length).toBe(2);
  });

  it('跳过没有预览色的 contextual 值', () => {
    const plan = planSwatches(matches, {
      ...ALLOW_ALL,
      hasPreview: (match) => previewSource(match) !== undefined,
    });
    expect(plan.matches.some((match) => match.syntax === 'light-dark')).toBe(false);
    expect(plan.matches.some((match) => match.syntax === 'hex')).toBe(true);
  });

  it('跳过其他提供器已覆盖的 range', () => {
    const hex = matches.filter((match) => match.syntax === 'hex');
    const covered = new Set([rangeKey(hex[0].range)]);
    const plan = planSwatches(matches, { ...ALLOW_ALL, covered });
    expect(plan.matches.some((match) => rangeKey(match.range) === rangeKey(hex[0].range))).toBe(false);
    expect(plan.matches.some((match) => rangeKey(match.range) === rangeKey(hex[1].range))).toBe(true);
  });

  it('按上限截断并报告丢弃数量', () => {
    const plan = planSwatches(matches, { ...ALLOW_ALL, limit: 3 });
    expect(plan.matches).toHaveLength(3);
    expect(plan.dropped).toBe(matches.length - 3);
  });

  it('同一 range 只上报一次', () => {
    const duplicated = [...matches, ...matches];
    const plan = planSwatches(duplicated, ALLOW_ALL);
    expect(plan.matches).toHaveLength(matches.length);
  });
});
