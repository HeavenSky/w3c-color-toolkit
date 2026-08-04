import { describe, expect, it } from 'vitest';

import { exactNamedColor, formatNumber, nearestNamedColor, serialize, targetSupportsAlpha } from '../../src/core/serializer.js';
import { convertTo } from '../../src/core/colorjs-bridge.js';
import type { SerializerOptions } from '../../src/core/types.js';

import { resolvedOf, to8Bit } from './helpers.js';

const BASE: SerializerOptions = {
  precision: 5,
  hexCase: 'lower',
  syntax: 'modern',
  gamutMapping: 'css',
  computeMissingComponents: false,
};

describe('数值格式化', () => {
  it('去掉多余尾随零', () => {
    expect(formatNumber(0.5, 5)).toBe('0.5');
    expect(formatNumber(1, 5)).toBe('1');
    expect(formatNumber(0, 5)).toBe('0');
  });

  it('按有效数字位数截断', () => {
    expect(formatNumber(0.123456789, 3)).toBe('0.123');
    expect(formatNumber(0.123456789, 5)).toBe('0.12346');
  });

  it('missing component 序列化为 none', () => {
    expect(formatNumber(Number.NaN, 5)).toBe('none');
  });

  it('不产生 "-0"', () => {
    expect(formatNumber(-0.0000001, 3)).toBe('0');
  });
});

describe('hex 序列化', () => {
  it('总是输出 6 位而不是缩写', () => {
    expect(serialize(resolvedOf('#f80'), 'hex', BASE).text).toBe('#ff8800');
  });

  it('有 alpha 时输出 8 位', () => {
    expect(serialize(resolvedOf('#ff880080'), 'hex', BASE).text).toBe('#ff880080');
  });

  it('hexCase = upper 时输出大写', () => {
    expect(serialize(resolvedOf('#ff8800'), 'hex', { ...BASE, hexCase: 'upper' }).text).toBe('#FF8800');
  });
});

describe('modern 与 legacy 风格', () => {
  it('modern rgb 使用空格与斜杠', () => {
    expect(serialize(resolvedOf('#ff8800'), 'rgb', BASE).text).toBe('rgb(255 136 0)');
    expect(serialize(resolvedOf('#ff880080'), 'rgb', BASE).text).toMatch(/^rgb\(255 136 0 \/ 0\.50/);
  });

  it('legacy rgb 使用逗号并在有 alpha 时用 rgba()', () => {
    const legacy = { ...BASE, syntax: 'legacy' as const };
    expect(serialize(resolvedOf('#ff8800'), 'rgb', legacy).text).toBe('rgb(255, 136, 0)');
    expect(serialize(resolvedOf('#ff880080'), 'rgb', legacy).text).toMatch(/^rgba\(255, 136, 0, 0\.50/);
  });

  it('legacy hsl 使用 hsla()', () => {
    const legacy = { ...BASE, syntax: 'legacy' as const };
    expect(serialize(resolvedOf('hsl(30 100% 50% / 0.5)'), 'hsl', legacy).text).toMatch(/^hsla\(/);
  });
});

describe('color() 与感知空间', () => {
  it.each([
    ['color-display-p3', 'color(display-p3'],
    ['color-rec2020', 'color(rec2020'],
    ['color-xyz-d50', 'color(xyz-d50'],
  ] as const)('%s 输出 %s 前缀', (target, prefix) => {
    expect(serialize(resolvedOf('#ff8800'), target, BASE).text.startsWith(prefix)).toBe(true);
  });

  it.each(['lab', 'lch', 'oklab', 'oklch', 'hwb'] as const)('%s() 输出函数形式', (target) => {
    expect(serialize(resolvedOf('#ff8800'), target, BASE).text.startsWith(`${target}(`)).toBe(true);
  });
});

describe('色域映射', () => {
  it('广色域转 sRGB 时标记 gamutMapped', () => {
    const result = serialize(resolvedOf('color(display-p3 0 1 0)'), 'hex', BASE);
    expect(result.gamutMapped).toBe(true);
  });

  it('sRGB 内的颜色不标记', () => {
    expect(serialize(resolvedOf('#ff8800'), 'hex', BASE).gamutMapped).toBe(false);
  });

  it('目标空间与原空间相同时保留原始分量', () => {
    const result = serialize(resolvedOf('color(display-p3 0 1 0)'), 'color-display-p3', BASE);
    expect(result.gamutMapped).toBe(false);
    expect(result.text).toBe('color(display-p3 0 1 0)');
  });

  it('clip 与 css 策略给出不同结果', () => {
    const css = serialize(resolvedOf('color(display-p3 0 1 0)'), 'hex', BASE).text;
    const clip = serialize(resolvedOf('color(display-p3 0 1 0)'), 'hex', {
      ...BASE,
      gamutMapping: 'clip',
    }).text;
    expect(css).not.toBe(clip);
  });
});

describe('信息损失', () => {
  it('missing component 在同空间保留为 none', () => {
    const result = serialize(resolvedOf('oklch(0.7 none 40)'), 'oklch', BASE);
    expect(result.text).toContain('none');
    expect(result.missingComponentsLost).toBe(false);
  });

  it('跨空间时 missing component 丢失并被标记', () => {
    const result = serialize(resolvedOf('oklch(0.7 none 40)'), 'hex', BASE);
    expect(result.missingComponentsLost).toBe(true);
  });

  it('computeMissingComponents 时按计算值输出', () => {
    const result = serialize(resolvedOf('oklch(0.7 none 40)'), 'oklch', {
      ...BASE,
      computeMissingComponents: true,
    });
    expect(result.text).not.toContain('none');
  });

  it('颜色名无法表达 alpha 时标记 alphaLost', () => {
    expect(targetSupportsAlpha('named-color')).toBe(false);
    const result = serialize(resolvedOf('rgb(255 0 0 / 0.5)'), 'named-color', BASE);
    expect(result.alphaLost).toBe(true);
  });
});

describe('命名颜色', () => {
  it('精确匹配返回颜色名', () => {
    expect(exactNamedColor(convertTo(resolvedOf('#ff0000'), 'srgb').coords)).toBe('red');
  });

  it('无精确匹配返回 undefined', () => {
    expect(exactNamedColor(convertTo(resolvedOf('#ff0001'), 'srgb').coords)).toBeUndefined();
  });

  it('别名冲突时取字典序更小的名字, 结果稳定', () => {
    const cyan = convertTo(resolvedOf('#00ffff'), 'srgb').coords;
    expect(exactNamedColor(cyan)).toBe('aqua');
  });

  it('最近匹配返回邻近颜色名', () => {
    expect(nearestNamedColor(convertTo(resolvedOf('#ff0001'), 'srgb').coords)).toBe('red');
  });

  it('序列化到颜色名时使用最近匹配', () => {
    expect(serialize(resolvedOf('#ff0000'), 'named-color', BASE).text).toBe('red');
  });
});

describe('往返一致性', () => {
  it.each([
    'color-srgb',
    'color-display-p3',
    'color-rec2020',
    'color-xyz-d50',
    'color-xyz-d65',
    'oklch',
    'oklab',
    'lab',
    'lch',
  ] as const)('#ff8800 经 %s 往返后 8-bit sRGB 不变', (target) => {
    const original = resolvedOf('#ff8800');
    const text = serialize(original, target, { ...BASE, precision: 10 }).text;
    const roundTripped = resolvedOf(text);
    expect(convertTo(roundTripped, 'srgb').coords.map(to8Bit)).toEqual(
      convertTo(original, 'srgb').coords.map(to8Bit),
    );
  });

  it('alpha 往返误差在 1e-4 内', () => {
    const original = resolvedOf('rgb(255 136 0 / 0.42)');
    const text = serialize(original, 'rgb', { ...BASE, precision: 10 }).text;
    expect(Math.abs(resolvedOf(text).alpha - original.alpha)).toBeLessThanOrEqual(1e-4);
  });
});
