import { describe, expect, it } from 'vitest';

import { convertTo } from '../../src/core/colorjs-bridge.js';
import { DEPRECATED_SYSTEM_COLORS, SYSTEM_COLORS } from '../../src/core/keywords.js';
import type { ContextualReason } from '../../src/core/types.js';

import { parse, to8Bit } from './helpers.js';

describe('currentColor', () => {
  it('是 contextual 而不是黑色', () => {
    const result = parse('currentColor');
    expect(result.resolution).toBe('contextual');
    expect(result.contextual?.reason).toBe('current-color');
    expect(result.resolved).toBeUndefined();
  });

  it('大小写不敏感', () => {
    expect(parse('CurrentColor').resolution).toBe('contextual');
    expect(parse('CURRENTCOLOR').contextual?.reason).toBe('current-color');
  });
});

describe('系统色', () => {
  it('19 个当前系统色都归为 contextual', () => {
    expect(SYSTEM_COLORS).toHaveLength(19);
    for (const name of SYSTEM_COLORS) {
      const result = parse(name);
      expect(result.resolution, `${name} 应为 contextual`).toBe('contextual');
      expect(result.contextual?.reason).toBe('system-color');
      expect(result.contextual?.dependsOn).toBe(name);
    }
  });

  it('23 个 deprecated 系统色带替代关键字', () => {
    expect(Object.keys(DEPRECATED_SYSTEM_COLORS)).toHaveLength(23);
    for (const [name, replacement] of Object.entries(DEPRECATED_SYSTEM_COLORS)) {
      const result = parse(name);
      expect(result.resolution, `${name} 应为 contextual`).toBe('contextual');
      expect(result.contextual?.reason).toBe('deprecated-system-color');
      expect(result.contextual?.replacement).toBe(replacement);
    }
  });

  it('系统色匹配大小写不敏感, 但回报规范大小写', () => {
    const result = parse('canvastext');
    expect(result.contextual?.dependsOn).toBe('CanvasText');
  });
});

describe('light-dark()', () => {
  it('默认是 contextual 并显示双分支', () => {
    const result = parse('light-dark(white, black)');
    expect(result.resolution).toBe('contextual');
    expect(result.contextual?.reason).toBe('color-scheme');
    expect(result.contextual?.branches.map((branch) => branch.label)).toEqual(['light', 'dark']);
    expect(result.contextual?.branches[0].resolved).toBeDefined();
    expect(result.contextual?.assumed).toBeUndefined();
  });

  it('contextualPreview = light 时给出标注为假设值的预览', () => {
    const result = parse('light-dark(white, black)', { contextualPreview: 'light' });
    expect(result.resolution).toBe('contextual');
    const assumed = result.contextual?.assumed;
    expect(assumed?.context).toBe('light');
    expect(convertTo(assumed!.resolved, 'srgb').coords.map(to8Bit)).toEqual([255, 255, 255]);
  });

  it('contextualPreview = dark 时取第二个分支', () => {
    const result = parse('light-dark(white, black)', { contextualPreview: 'dark' });
    expect(convertTo(result.contextual!.assumed!.resolved, 'srgb').coords.map(to8Bit)).toEqual([0, 0, 0]);
  });

  it('分支数量不对时为 invalid', () => {
    expect(parse('light-dark(white)').resolution).toBe('invalid');
  });
});

describe('自定义 @color-profile', () => {
  it('没有 fallback 时为 contextual', () => {
    const result = parse('color(--my-profile 0.1 0.2 0.3)');
    expect(result.resolution).toBe('contextual');
    expect(result.contextual?.reason).toBe('custom-color-profile');
    expect(result.contextual?.dependsOn).toBe('--my-profile');
  });

  it('有 fallback 时按 fallback 解析', () => {
    const fallback = parse('red').resolved!;
    const result = parse('color(--my-profile 0.1 0.2 0.3)', {
      colorProfileFallbacks: new Map([['--my-profile', fallback]]),
    });
    expect(result.resolution).toBe('resolved');
    expect(convertTo(result.resolved!, 'srgb').coords.map(to8Bit)).toEqual([255, 0, 0]);
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.customProfileFallback')).toBe(true);
  });
});

describe('非静态 alpha', () => {
  it('var() alpha 降级为 contextual 而不是当成 1', () => {
    const result = parse('rgb(255 0 0 / var(--a))');
    expect(result.resolution).toBe('contextual');
    expect(result.diagnostics.some((d) => d.messageKey === 'diagnostic.nonStaticAlpha')).toBe(true);
  });
});

describe('ContextualReason 覆盖', () => {
  it('已实现的原因分类都能被触发', () => {
    const triggered = new Set<ContextualReason>();
    triggered.add(parse('currentColor').contextual!.reason);
    triggered.add(parse('Canvas').contextual!.reason);
    triggered.add(parse('Menu').contextual!.reason);
    triggered.add(parse('light-dark(white, black)').contextual!.reason);
    triggered.add(parse('color(--x 0 0 0)').contextual!.reason);
    triggered.add(parse('ictcp(0.5 0 0)').contextual!.reason);
    triggered.add(parse('hdr-color(red 1, blue 4)', { cssColorHdr: true }).contextual!.reason);

    expect(triggered).toContain('current-color');
    expect(triggered).toContain('system-color');
    expect(triggered).toContain('deprecated-system-color');
    expect(triggered).toContain('color-scheme');
    expect(triggered).toContain('custom-color-profile');
    expect(triggered).toContain('unsupported-experimental-context');
    expect(triggered).toContain('hdr-headroom');
  });
});
