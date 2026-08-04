import { describe, expect, it } from 'vitest';

import { convertTo } from '../../src/core/colorjs-bridge.js';
import { NAMED_COLOR_COUNT, NAMED_COLORS } from '../../src/core/keywords.js';
import { COLOR4_COLOR_SPACES } from '../../src/core/keywords.js';

import { parse, resolvedOf, to8Bit } from './helpers.js';

describe('CSS Color 3 legacy 兼容', () => {
  it('识别逗号语法 rgb() 与 rgba()', () => {
    const rgb = parse('rgb(255, 136, 0)');
    expect(rgb.resolution).toBe('resolved');
    expect(rgb.syntax).toBe('legacy-rgb');
    expect(rgb.specLevel).toBe('color-3');

    const rgba = parse('rgba(255, 136, 0, 0.5)');
    expect(rgba.resolved?.alpha).toBeCloseTo(0.5, 4);
  });

  it('识别逗号语法 hsl() 与 hsla()', () => {
    const hsl = parse('hsl(30, 100%, 50%)');
    expect(hsl.syntax).toBe('legacy-hsl');
    expect(hsl.specLevel).toBe('color-3');
    expect(parse('hsla(30, 100%, 50%, 0.25)').resolved?.alpha).toBeCloseTo(0.25, 4);
  });
});

describe('CSS Color 4 hex 与命名颜色', () => {
  it.each([
    ['#f80', 'hex'],
    ['#f808', 'hex'],
    ['#ff8800', 'hex'],
    ['#ff880080', 'hex'],
  ])('%s 解析为 %s', (input, syntax) => {
    const result = parse(input);
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe(syntax);
  });

  it('四种 hex 长度得到一致的 sRGB', () => {
    const short = convertTo(resolvedOf('#f80'), 'srgb').coords.map(to8Bit);
    const long = convertTo(resolvedOf('#ff8800'), 'srgb').coords.map(to8Bit);
    expect(short).toEqual(long);
  });

  it('hex alpha 生效', () => {
    expect(resolvedOf('#ff880080').alpha).toBeCloseTo(128 / 255, 4);
  });

  it('命名颜色表共 148 个, 与规范一致', () => {
    expect(NAMED_COLOR_COUNT).toBe(148);
    expect(Object.keys(NAMED_COLORS)).toHaveLength(148);
    expect(NAMED_COLORS.rebeccapurple).toEqual([102, 51, 153]);
  });

  it('全部命名颜色都能解析并往返到相同的 8-bit sRGB', () => {
    for (const [name, expected] of Object.entries(NAMED_COLORS)) {
      const resolved = resolvedOf(name);
      const actual = convertTo(resolved, 'srgb').coords.map(to8Bit);
      expect(actual, `${name} 的 sRGB 不匹配`).toEqual([...expected]);
    }
  });

  it('命名颜色大小写不敏感', () => {
    expect(convertTo(resolvedOf('RebeccaPurple'), 'srgb').coords.map(to8Bit)).toEqual([102, 51, 153]);
  });

  it('transparent 是可解析的透明黑', () => {
    const result = parse('transparent');
    expect(result.resolution).toBe('resolved');
    expect(result.resolved?.alpha).toBe(0);
  });
});

describe('CSS Color 4 现代语法与分量形式', () => {
  it.each([
    'rgb(255 136 0)',
    'rgb(100% 53.33% 0%)',
    'rgb(255 136 0 / 50%)',
    'hsl(30 100% 50%)',
    'hwb(30 0% 0%)',
    'lab(50% 40 30)',
    'lch(50% 40 30)',
    'oklab(0.7 0.1 0.1)',
    'oklch(0.7 0.2 40)',
  ])('%s 可静态解析', (input) => {
    const result = parse(input);
    expect(result.resolution).toBe('resolved');
    expect(result.experimental).toBe(false);
  });

  it.each([
    ['oklch(0.7 0.2 40deg)', 40],
    ['oklch(0.7 0.2 100grad)', 90],
    ['oklch(0.7 0.2 0.25turn)', 90],
  ])('%s 的 hue 归一为 %s 度', (input, expected) => {
    const resolved = resolvedOf(input);
    expect(resolved.originalChannels[2]).toBeCloseTo(expected, 6);
  });

  it('rad 单位的 hue 与 deg 等价', () => {
    const rad = resolvedOf('oklch(0.7 0.2 3.14159265rad)');
    const deg = resolvedOf('oklch(0.7 0.2 180deg)');
    expect(rad.xyzD50[0]).toBeCloseTo(deg.xyzD50[0], 6);
  });

  it('none 记录为 missing component', () => {
    const resolved = resolvedOf('oklch(0.7 none 40)');
    expect(resolved.missingComponents).toEqual([1]);
    expect(resolved.originalChannels[1]).toBeNull();
  });

  it('静态 calc() 参与求值', () => {
    const calc = resolvedOf('rgb(calc(100 + 155) 136 0)');
    const plain = resolvedOf('rgb(255 136 0)');
    expect(calc.xyzD50[0]).toBeCloseTo(plain.xyzD50[0], 10);
  });

  it('超范围分量不在解析阶段裁剪', () => {
    const resolved = resolvedOf('rgb(300 -20 0)');
    expect(resolved.originalChannels[0]).toBeGreaterThan(1);
  });
});

describe('CSS Color 4 color() 预定义空间', () => {
  it('矩阵中的 10 个空间关键字都能解析', () => {
    expect(COLOR4_COLOR_SPACES).toHaveLength(10);
    for (const space of COLOR4_COLOR_SPACES) {
      const result = parse(`color(${space} 0.2 0.4 0.6)`);
      expect(result.resolution, `${space} 未解析`).toBe('resolved');
    }
  });

  it('xyz 是 xyz-d65 的同义词', () => {
    const xyz = resolvedOf('color(xyz 0.2 0.4 0.6)');
    const d65 = resolvedOf('color(xyz-d65 0.2 0.4 0.6)');
    expect(xyz.xyzD50).toEqual(d65.xyzD50);
  });

  it('广色域颜色落在 sRGB 之外', () => {
    const p3 = resolvedOf('color(display-p3 0 1 0)');
    const srgbCoords = convertTo(p3, 'srgb').coords;
    expect(Math.max(...srgbCoords)).toBeGreaterThan(1);
  });

  it('sourceSpace 保留原始空间而不是交换空间', () => {
    expect(parse('color(rec2020 0.5 0.5 0.5)').sourceSpace).toBe('rec2020');
    expect(parse('oklch(0.7 0.2 40)').sourceSpace).toBe('oklch');
  });
});
