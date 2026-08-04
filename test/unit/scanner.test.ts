import { describe, expect, it } from 'vitest';

import { findMatchAtOffset, scanText, type ScanOptions } from '../../src/core/scanner.js';
import type { ColorMatch } from '../../src/core/types.js';

import { DEFAULT_PARSE_OPTIONS } from './helpers.js';

const BASE: ScanOptions = {
  ...DEFAULT_PARSE_OPTIONS,
  matchWords: 'css-like',
  cssLikeLanguage: true,
  scanComments: true,
  scanStrings: true,
  maxMatches: 10000,
};

function scan(text: string, overrides: Partial<ScanOptions> = {}): readonly ColorMatch[] {
  return scanText(text, { ...BASE, ...overrides }).matches;
}

/** raw 必须与用 range 从原文切出来的文本完全相等 (方案 §7.2 约束)。 */
function assertRawMatchesRange(text: string, matches: readonly ColorMatch[]): void {
  for (const match of matches) {
    expect(text.slice(match.range.start, match.range.end)).toBe(match.raw);
  }
}

describe('范围精度', () => {
  it('单个颜色的 range 精确覆盖表达式', () => {
    const text = 'a { color: #ff8800; }';
    const matches = scan(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe('#ff8800');
    expect(matches[0].range).toEqual({ start: 11, end: 18 });
    assertRawMatchesRange(text, matches);
  });

  it('函数颜色的 range 含闭括号', () => {
    const text = 'a { color: oklch(0.7 0.2 40); }';
    const matches = scan(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe('oklch(0.7 0.2 40)');
    assertRawMatchesRange(text, matches);
  });

  it('UTF-16 offset: emoji 前缀不破坏范围', () => {
    const text = '/* 🎨 */ a { color: red; }';
    const matches = scan(text);
    const red = matches.find((match) => match.raw === 'red');
    expect(red).toBeDefined();
    assertRawMatchesRange(text, matches);
  });

  it('非 ASCII 前缀不破坏范围', () => {
    const text = '.标题 { color: #abcdef; }';
    const matches = scan(text);
    expect(matches).toHaveLength(1);
    assertRawMatchesRange(text, matches);
  });

  it('跨行函数的 range 正确', () => {
    const text = 'a {\n  color: color-mix(\n    in oklch,\n    red,\n    blue\n  );\n}';
    const matches = scan(text);
    const mix = matches.find((match) => match.syntax === 'color-mix');
    expect(mix).toBeDefined();
    assertRawMatchesRange(text, matches);
  });
});

describe('嵌套与相邻', () => {
  it('嵌套颜色函数只返回最外层', () => {
    const matches = scan('a { color: color-mix(in oklch, red, blue); }');
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe('color-mix');
  });

  it('相对颜色的原点颜色不单独返回', () => {
    const matches = scan('a { color: oklch(from red l c h); }');
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe('relative-oklch');
  });

  it('相邻颜色分别返回', () => {
    const text = 'a { border: 1px solid #fff #000; }';
    const matches = scan(text);
    expect(matches.map((match) => match.raw)).toEqual(['#fff', '#000']);
    assertRawMatchesRange(text, matches);
  });

  it('gradient 内部的颜色逐个返回', () => {
    const matches = scan('a { background: linear-gradient(to right, red, blue); }');
    expect(matches.map((match) => match.raw)).toEqual(['red', 'blue']);
  });

  it('var() 内部的 fallback 颜色可被识别', () => {
    const matches = scan('a { color: var(--x, #123456); }');
    expect(matches.map((match) => match.raw)).toEqual(['#123456']);
  });
});

describe('误报保护', () => {
  it.each([
    ['a { background: url(sprite.svg#face); }', 'URL fragment'],
    ['/* id: 550e8400-e29b-41d4-a716-446655440000 */', 'UUID'],
    ['.badge-red-500 { padding: 0; }', '类名片段'],
    ['a { --my-red-token: 1; }', '变量名片段'],
    ['a { content: "deadbeefdeadbeef"; }', '长 hex 字符串'],
  ])('%s 不产生 match (%s)', (text) => {
    expect(scan(text)).toHaveLength(0);
  });

  it('Markdown 标题不被当成 hex', () => {
    expect(scan('### Heading')).toHaveLength(0);
  });

  it('非法 hex 长度不产生 match', () => {
    // 3/4/6/8 位都是合法的 CSS hex, 因此这里用 5 位与 10 位。
    expect(scan('a { color: #ff880; }')).toHaveLength(0);
    expect(scan('a { color: #ff8800aabb; }')).toHaveLength(0);
  });

  it('4 位 #RGBA 是合法 hex', () => {
    const matches = scan('a { color: #ff88; }');
    expect(matches).toHaveLength(1);
    expect(matches[0].resolved?.alpha).toBeCloseTo(0x88 / 255, 4);
  });

  it('属性名与 deprecated 系统色同名时不产生 match', () => {
    // `background`、`Menu`、`Window` 既是属性名/标识符, 也是 deprecated 系统色。
    expect(scan('a { background: none; }')).toHaveLength(0);
    expect(scan('a { Menu: 1; }')).toHaveLength(0);
  });

  it('值位置的 deprecated 系统色仍然识别并给出替代关键字', () => {
    const matches = scan('a { color: Menu; }');
    expect(matches).toHaveLength(1);
    expect(matches[0].contextual?.reason).toBe('deprecated-system-color');
    expect(matches[0].contextual?.replacement).toBe('Canvas');
  });

  it('dynamic-range-limit 的关键字不产生颜色 match', () => {
    expect(scan('a { dynamic-range-limit: standard; }')).toHaveLength(0);
    expect(scan('a { dynamic-range-limit: constrained; }')).toHaveLength(0);
  });

  it('dynamic-range-limit-mix() 不产生颜色 match', () => {
    expect(scan('a { dynamic-range-limit: dynamic-range-limit-mix(standard 50%, no-limit 50%); }')).toHaveLength(
      0,
    );
  });
});

describe('matchWords 与语言', () => {
  it('css-like 在 CSS 中识别颜色名', () => {
    expect(scan('a { color: red; }', { matchWords: 'css-like', cssLikeLanguage: true })).toHaveLength(1);
  });

  it('css-like 在非 CSS 语言中不识别颜色名', () => {
    expect(scan('const red = 1;', { matchWords: 'css-like', cssLikeLanguage: false })).toHaveLength(0);
  });

  it('all 在任何语言都识别颜色名', () => {
    expect(scan('const x = red;', { matchWords: 'all', cssLikeLanguage: false })).toHaveLength(1);
  });

  it('off 时不识别颜色名, 但仍识别 hex', () => {
    expect(scan('a { color: red; }', { matchWords: 'off' })).toHaveLength(0);
    expect(scan('a { color: #ff0000; }', { matchWords: 'off' })).toHaveLength(1);
  });

  it('currentColor 与系统色不受 matchWords 影响', () => {
    expect(scan('a { color: currentColor; }', { matchWords: 'off' })).toHaveLength(1);
    expect(scan('a { color: Canvas; }', { matchWords: 'off' })).toHaveLength(1);
  });
});

describe('注释与字符串', () => {
  it('默认扫描注释内的颜色', () => {
    const matches = scan('/* brand: #ff8800 */');
    expect(matches.map((match) => match.raw)).toContain('#ff8800');
  });

  it('scanComments 关闭后注释内不产生 match', () => {
    expect(scan('/* brand: #ff8800 */', { scanComments: false, scanStrings: false })).toHaveLength(0);
  });

  it('默认扫描字符串内的颜色', () => {
    const text = 'const c = "#ff8800";';
    const matches = scan(text, { matchWords: 'all', cssLikeLanguage: false });
    expect(matches.map((match) => match.raw)).toContain('#ff8800');
    assertRawMatchesRange(text, matches);
  });

  it('scanStrings 关闭后字符串内不产生 match', () => {
    expect(
      scan('const c = "#ff8800";', { scanStrings: false, scanComments: false }),
    ).toHaveLength(0);
  });
});

describe('排序、去重与上限', () => {
  it('结果按 range 升序且不重叠', () => {
    const matches = scan('a { color: #fff; background: rgb(0 0 0); border-color: red; }');
    for (let index = 1; index < matches.length; index += 1) {
      expect(matches[index].range.start).toBeGreaterThanOrEqual(matches[index - 1].range.end);
    }
  });

  it('同一 range 只保留一个 match', () => {
    const matches = scan('a { color: #ff8800; }');
    const starts = matches.map((match) => match.range.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('超过 maxMatches 时截断并标记', () => {
    const text = Array.from({ length: 50 }, () => 'color: #fff;').join(' ');
    const result = scanText(text, { ...BASE, maxMatches: 10 });
    expect(result.truncated).toBe(true);
    expect(result.matches.length).toBeLessThanOrEqual(10);
  });
});

describe('findMatchAtOffset', () => {
  it('命中范围内的 offset', () => {
    const text = 'a { color: #ff8800; }';
    const matches = scan(text);
    expect(findMatchAtOffset(matches, 11)?.raw).toBe('#ff8800');
    expect(findMatchAtOffset(matches, 14)?.raw).toBe('#ff8800');
    expect(findMatchAtOffset(matches, 17)?.raw).toBe('#ff8800');
  });

  it('开区间: end 不算命中', () => {
    const matches = scan('a { color: #ff8800; }');
    expect(findMatchAtOffset(matches, 18)).toBeUndefined();
  });

  it('范围外返回 undefined', () => {
    const matches = scan('a { color: #ff8800; }');
    expect(findMatchAtOffset(matches, 0)).toBeUndefined();
  });
});

describe('上下文与实验语法在扫描层的表现', () => {
  it('currentColor 是 contextual', () => {
    const matches = scan('a { color: currentColor; }');
    expect(matches[0].resolution).toBe('contextual');
    expect(matches[0].contextual?.reason).toBe('current-color');
  });

  it('实验开关关闭时 HDR 函数不产生 resolved', () => {
    const matches = scan('a { color: ictcp(0.5 0 0); }');
    expect(matches[0].resolution).toBe('contextual');
    expect(matches[0].experimental).toBe(true);
    expect(matches[0].diagnostics.some((d) => d.code === 'experimental-disabled')).toBe(true);
  });

  it('实验开关开启时 HDR 函数可解析', () => {
    const matches = scan('a { color: ictcp(0.5 0 0); }', { cssColorHdr: true });
    expect(matches[0].resolution).toBe('resolved');
    expect(matches[0].specLevel).toBe('color-hdr-1');
  });
});
