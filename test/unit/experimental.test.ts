import { describe, expect, it } from 'vitest';

import { convertTo } from '../../src/core/colorjs-bridge.js';
import { toneMapForPreview } from '../../src/core/experimental-hdr.js';
import { functionWhitelist, HDR_FUNCTIONS, COLOR6_FUNCTIONS } from '../../src/core/keywords.js';

import { parse, resolvedOf, to8Bit } from './helpers.js';

describe('实验开关关闭时的行为', () => {
  it.each([
    'color-layers(red, blue)',
    'ictcp(0.5 0 0)',
    'jzazbz(0.5 0 0)',
    'jzczhz(0.5 0.1 40)',
    'hdr-color(red 1, blue 4)',
    'color-hdr(red 1, blue 4)',
    'color(rec2100-pq 0.5 0.5 0.5)',
  ])('%s 不产生 resolved 且给出 experimental-disabled', (input) => {
    const result = parse(input);
    expect(result.resolution).not.toBe('resolved');
    expect(result.experimental).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'experimental-disabled')).toBe(true);
  });

  it('实验函数不进入函数名白名单', () => {
    const closed = functionWhitelist({ cssColor6: false, cssColorHdr: false });
    for (const name of [...HDR_FUNCTIONS, ...COLOR6_FUNCTIONS]) {
      expect(closed.has(name), `${name} 不应在白名单中`).toBe(false);
    }
  });

  it('开关打开后进入白名单', () => {
    const open = functionWhitelist({ cssColor6: true, cssColorHdr: true });
    for (const name of [...HDR_FUNCTIONS, ...COLOR6_FUNCTIONS]) {
      expect(open.has(name), `${name} 应在白名单中`).toBe(true);
    }
  });

  it('Color 4 主路径不受实验开关影响', () => {
    expect(parse('oklch(0.7 0.2 40)').resolution).toBe('resolved');
    expect(parse('oklch(0.7 0.2 40)', { cssColor6: true, cssColorHdr: true }).resolution).toBe('resolved');
  });
});

describe('CSS Color HDR 1', () => {
  const hdr = { cssColorHdr: true } as const;

  it.each([
    ['ictcp(0.5 0 0)', 'ictcp'],
    ['jzazbz(0.1 0 0)', 'jzazbz'],
    ['jzczhz(0.1 0.02 40)', 'jzczhz'],
  ])('%s 可解析并保留原空间', (input, space) => {
    const result = parse(input, hdr);
    expect(result.resolution).toBe('resolved');
    expect(result.specLevel).toBe('color-hdr-1');
    expect(result.experimental).toBe(true);
    expect(result.sourceSpace).toBe(space);
  });

  it.each(['rec2100-pq', 'rec2100-hlg', 'rec2100-linear'])('color(%s ...) 可解析', (space) => {
    const result = parse(`color(${space} 0.5 0.5 0.5)`, hdr);
    expect(result.resolution).toBe('resolved');
    expect(result.sourceSpace).toBe(space);
  });

  it('jzczhz 的第三分量按 <hue> 处理', () => {
    const deg = resolvedOf('jzczhz(0.1 0.02 90deg)', hdr);
    const num = resolvedOf('jzczhz(0.1 0.02 90)', hdr);
    expect(deg.xyzD50[0]).toBeCloseTo(num.xyzD50[0], 10);
  });

  it('hdr-color() 即使开启也恒为 contextual', () => {
    const result = parse('hdr-color(red 1, blue 4)', hdr);
    expect(result.resolution).toBe('contextual');
    expect(result.contextual?.reason).toBe('hdr-headroom');
  });

  it('color-hdr() 别名也被识别, 并记录采用的名字', () => {
    const result = parse('color-hdr(red 1, blue 4)', hdr);
    expect(result.resolution).toBe('contextual');
    expect(result.diagnostics.some((d) => d.messageArgs?.includes('color-hdr'))).toBe(true);
  });

  it('相对颜色形式暂不求值, 但给出明确 diagnostic 而不是静默失败', () => {
    const result = parse('ictcp(from red i ct cp)', hdr);
    expect(result.resolution).toBe('contextual');
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.hdrRelativeUnsupported')).toBe(true);
  });

  it('rec2100-linear 的中灰仍在 sRGB 附近', () => {
    const resolved = resolvedOf('color(rec2100-linear 0.5 0.5 0.5)', hdr);
    const srgb = convertTo(resolved, 'srgb').coords;
    expect(Math.max(...srgb)).toBeGreaterThan(0);
  });

  it('色调映射把超亮值压回 sRGB 可表达范围并置标记', () => {
    const bright = resolvedOf('color(rec2100-pq 1 1 1)', hdr);
    const mapped = toneMapForPreview(bright, 'reinhard');
    expect(mapped.hdrToneMapped).toBe(true);
    expect(mapped.xyzD50[1]).toBeLessThanOrEqual(bright.xyzD50[1]);
  });

  it('clip 模式直接裁剪', () => {
    const bright = resolvedOf('color(rec2100-pq 1 1 1)', hdr);
    const mapped = toneMapForPreview(bright, 'clip');
    expect(mapped.xyzD50[1]).toBeLessThanOrEqual(1);
  });

  it('none 模式不改变数值', () => {
    const bright = resolvedOf('color(rec2100-pq 1 1 1)', hdr);
    expect(toneMapForPreview(bright, 'none')).toBe(bright);
  });
});

describe('CSS Color 6', () => {
  const color6 = { cssColor6: true } as const;

  it('color-layers() 合成不透明层时取最上层', () => {
    const result = parse('color-layers(red, blue)', color6);
    expect(result.resolution).toBe('resolved');
    expect(result.specLevel).toBe('color-6');
    expect(convertTo(result.resolved!, 'srgb').coords.map(to8Bit)).toEqual([255, 0, 0]);
  });

  it('半透明层按 source-over 合成', () => {
    const result = parse('color-layers(rgb(255 0 0 / 0.5), blue)', color6);
    const coords = convertTo(result.resolved!, 'srgb').coords.map(to8Bit);
    expect(coords[0]).toBeGreaterThan(0);
    expect(coords[2]).toBeGreaterThan(0);
  });

  it('未实现的 blend mode 给出说明而不是失败', () => {
    const result = parse('color-layers(multiply, red, blue)', color6);
    expect(result.resolution).toBe('resolved');
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.colorLayersBlendMode')).toBe(true);
  });

  it('wcag2 关键字形式的 contrast-color() 可求值', () => {
    const result = parse('contrast-color(white wcag2)', color6);
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('contrast-color-ext');
    expect(result.specLevel).toBe('color-6');
  });

  it.each(['aa', 'aaa', 'large'])('wcag2(%s) 形式可求值', (level) => {
    const result = parse(`contrast-color(white wcag2(${level}))`, color6);
    expect(result.resolution).toBe('resolved');
  });

  it('候选颜色中选出对比度更高者', () => {
    const result = parse('contrast-color(white wcag2, black, #eeeeee)', color6);
    expect(convertTo(result.resolved!, 'srgb').coords.map(to8Bit)).toEqual([0, 0, 0]);
  });

  it('达不到目标对比度时给出告警', () => {
    const result = parse('contrast-color(white wcag2(aaa), #f0f0f0)', color6);
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.contrastTargetUnmet')).toBe(true);
  });

  it('tbd-fg / tbd-bg 只识别不求值', () => {
    const result = parse('contrast-color(white tbd-bg wcag2)', color6);
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.color6BaseRoleUndefined')).toBe(true);
  });

  it('Color 5 基本形式的 contrast-color() 不走 Color 6 分支', () => {
    const result = parse('contrast-color(red)');
    expect(result.syntax).toBe('contrast-color');
    expect(result.specLevel).toBe('color-5');
  });
});
