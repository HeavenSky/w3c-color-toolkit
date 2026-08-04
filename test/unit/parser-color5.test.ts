import { describe, expect, it } from 'vitest';

import { convertTo } from '../../src/core/colorjs-bridge.js';

import { parse, resolvedOf, to8Bit } from './helpers.js';

describe('color-mix()', () => {
  it('两颜色形式', () => {
    const result = parse('color-mix(in oklch, red, blue)');
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('color-mix');
    expect(result.specLevel).toBe('color-5');
  });

  it('三个及以上颜色的多颜色形式', () => {
    const result = parse('color-mix(in oklch, red 20%, blue 30%, green 50%)');
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('color-mix-variadic');
  });

  it('百分比归一化: 权重和不为 100% 时按比例缩放', () => {
    const scaled = resolvedOf('color-mix(in srgb, red 25%, blue 25%)');
    const normalized = resolvedOf('color-mix(in srgb, red 50%, blue 50%)');
    expect(scaled.xyzD50[0]).toBeCloseTo(normalized.xyzD50[0], 10);
  });

  it('50/50 sRGB 混合结果居中', () => {
    const mixed = convertTo(resolvedOf('color-mix(in srgb, white, black)'), 'srgb').coords;
    expect(to8Bit(mixed[0])).toBe(128);
  });

  it.each(['shorter hue', 'longer hue', 'increasing hue', 'decreasing hue'])(
    '支持 %s 插值',
    (method) => {
      const result = parse(`color-mix(in hsl ${method}, red, blue)`);
      expect(result.resolution).toBe('resolved');
    },
  );

  it('longer hue 与 shorter hue 结果不同', () => {
    const shorter = resolvedOf('color-mix(in hsl shorter hue, red, blue)');
    const longer = resolvedOf('color-mix(in hsl longer hue, red, blue)');
    expect(shorter.originalChannels[0]).not.toBeCloseTo(longer.originalChannels[0] as number, 3);
  });

  it('混合时 alpha 参与预乘', () => {
    const mixed = resolvedOf('color-mix(in srgb, rgb(255 0 0 / 0), blue)');
    expect(mixed.alpha).toBeCloseTo(0.5, 4);
  });

  it('嵌套 color-mix 可求值', () => {
    expect(parse('color-mix(in oklch, color-mix(in srgb, red, blue), green)').resolution).toBe(
      'resolved',
    );
  });
});

describe('relative color syntax', () => {
  it.each([
    ['rgb(from rebeccapurple r g b)', 'relative-srgb'],
    ['hsl(from red h s l)', 'relative-hsl'],
    ['hwb(from red h w b)', 'relative-hwb'],
    ['lab(from red l a b)', 'relative-lab'],
    ['lch(from red l c h)', 'relative-lch'],
    ['oklab(from red l a b)', 'relative-oklab'],
    ['oklch(from red l c h)', 'relative-oklch'],
    ['color(from red srgb r g b)', 'relative-srgb'],
  ])('%s 可静态求值', (input, syntax) => {
    const result = parse(input);
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe(syntax);
    expect(result.specLevel).toBe('color-5');
  });

  it('恒等相对颜色与原色一致', () => {
    const identity = resolvedOf('rgb(from rebeccapurple r g b)');
    const original = resolvedOf('rebeccapurple');
    expect(convertTo(identity, 'srgb').coords.map(to8Bit)).toEqual(
      convertTo(original, 'srgb').coords.map(to8Bit),
    );
  });

  it('分量关键字可参与 calc()', () => {
    const half = resolvedOf('oklch(from red calc(l * 0.5) c h)');
    const full = resolvedOf('oklch(from red l c h)');
    expect(half.xyzD50[1]).toBeLessThan(full.xyzD50[1]);
  });

  it('XYZ 空间使用 x y z 分量关键字', () => {
    expect(parse('color(from red xyz-d50 x y z)').resolution).toBe('resolved');
  });

  it('相对颜色可改写 alpha', () => {
    expect(resolvedOf('rgb(from red r g b / 0.25)').alpha).toBeCloseTo(0.25, 4);
  });
});

describe('Relative Alpha Color alpha()', () => {
  it('alpha(from <color> / <alpha>) 只改 alpha', () => {
    const result = parse('alpha(from red / 0.5)');
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('alpha');
    expect(result.specLevel).toBe('color-5');
    expect(result.resolved?.alpha).toBeCloseTo(0.5, 4);
  });

  it('颜色分量保持不变', () => {
    const withAlpha = convertTo(resolvedOf('alpha(from red / 0.5)'), 'srgb').coords.map(to8Bit);
    const original = convertTo(resolvedOf('red'), 'srgb').coords.map(to8Bit);
    expect(withAlpha).toEqual(original);
  });
});

describe('contrast-color()', () => {
  it('基本形式可求值', () => {
    const result = parse('contrast-color(red)');
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('contrast-color');
  });

  it('白底选出深色, 黑底选出浅色', () => {
    const onWhite = convertTo(resolvedOf('contrast-color(white)'), 'srgb').coords.map(to8Bit);
    const onBlack = convertTo(resolvedOf('contrast-color(black)'), 'srgb').coords.map(to8Bit);
    expect(onWhite).toEqual([0, 0, 0]);
    expect(onBlack).toEqual([255, 255, 255]);
  });
});

describe('device-cmyk() 无 ICC fallback', () => {
  it('按 CSS Color 5 的朴素公式求值并标记为近似', () => {
    const result = parse('device-cmyk(0 0.5 1 0)');
    expect(result.resolution).toBe('resolved');
    expect(result.syntax).toBe('device-cmyk');
    expect(result.resolved?.approximate).toBe(true);
    const coords = convertTo(result.resolved!, 'srgb').coords;
    expect(coords[0]).toBeCloseTo(1, 6);
    expect(coords[1]).toBeCloseTo(0.5, 6);
    expect(coords[2]).toBeCloseTo(0, 6);
  });

  it('黑色分量参与 min(1, x + k)', () => {
    const coords = convertTo(resolvedOf('device-cmyk(0 0 0 1)'), 'srgb').coords;
    expect(coords.map(to8Bit)).toEqual([0, 0, 0]);
  });

  it('支持百分比与 alpha', () => {
    const result = parse('device-cmyk(0% 50% 100% 0% / 0.5)');
    expect(result.resolved?.alpha).toBeCloseTo(0.5, 4);
  });

  it('分量数量不对时为 invalid', () => {
    const result = parse('device-cmyk(0 0.5)');
    expect(result.resolution).toBe('invalid');
    expect(result.diagnostics[0]?.code).toBe('invalid-component-count');
  });

  it('附带 upstream-unsupported 说明 CSSTools 不解析该语法', () => {
    expect(parse('device-cmyk(0 0 0 0)').diagnostics.map((d) => d.code)).toContain(
      'upstream-unsupported',
    );
  });
});
