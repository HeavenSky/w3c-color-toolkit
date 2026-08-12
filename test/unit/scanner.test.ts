import { describe, expect, it } from 'vitest';

import {
  findMatchAtOffset,
  isCssLikeLanguage,
  isVariableLanguage,
  scanText,
  type ScanOptions,
} from '../../src/core/scanner.js';
import type { ColorMatch, ResolveVariable } from '../../src/core/types.js';

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

/**
 * 变量取值替身。
 *
 * 扫描器不认识符号表, 只认一个回调, 因此这里用最小替身覆盖三态。没有回调时变量引用
 * 一律解析不出来 —— 那正是"关闭变量解析"与"非变量语言"的行为, 多数用例照旧不传。
 */
function resolver(values: Record<string, string> = {}, ambiguous: readonly string[] = []): ResolveVariable {
  return (name) => {
    const value = values[name];
    if (value !== undefined) return { kind: 'resolved', rawValue: value };
    if (ambiguous.includes(name)) {
      return {
        kind: 'ambiguous',
        candidates: [
          { rawValue: '#ffffff', origin: ':root' },
          { rawValue: '#000000', origin: '@media (prefers-color-scheme: dark) › :root' },
        ],
      };
    }
    return { kind: 'unresolved' };
  };
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

  it('var() 整体成为变量引用, fallback 作为 nested 保留', () => {
    // `var()` 是变量引用候选, 范围覆盖整个表达式; 内层 fallback 与它重叠且更短,
    // 去重时落选, 但不再丢弃 —— 挂到 `nested` 上供行内色块单独渲染。
    const text = 'a { color: var(--x, #123456); }';
    const matches = scan(text, { resolveVariable: resolver({ '--x': '#ff8800' }) });
    expect(matches.map((match) => match.raw)).toEqual(['var(--x, #123456)']);
    expect(matches[0].syntax).toBe('css-variable');
    expect(matches[0].nested?.map((match) => match.raw)).toEqual(['#123456']);
    assertRawMatchesRange(text, matches[0].nested ?? []);
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

describe('变量识别范围与颜色识别范围分开', () => {
  it('两份语言表各管各的', () => {
    // tailwindcss: 变量要识别, 但它不是"CSS 系语言"(裸颜色名的判定表)。
    expect(isVariableLanguage('tailwindcss')).toBe(true);
    expect(isCssLikeLanguage('tailwindcss')).toBe(false);
    // stylus: 颜色照旧识别, 变量不识别 (方案 D3)。
    expect(isCssLikeLanguage('stylus')).toBe(true);
    expect(isVariableLanguage('stylus')).toBe(false);
  });

  it('语言表可被配置覆盖', () => {
    expect(isVariableLanguage('vue', ['vue'])).toBe(true);
    expect(isVariableLanguage('css', ['vue'])).toBe(false);
    // null / undefined 表示用内置表。
    expect(isVariableLanguage('css', null)).toBe(true);
  });

  it('Stylus: 颜色照旧识别, 变量引用不识别', () => {
    // `.styl` 文件的 languageId 属于 CSS 系 (颜色名照旧), 但不在变量语言表内。
    const options = { cssLikeLanguage: true, variableSyntax: false } as const;
    expect(scan('.a\n  color: #ff8800\n', options).map((m) => m.raw)).toEqual(['#ff8800']);
    expect(scan('.a\n  color: red\n', options).map((m) => m.raw)).toEqual(['red']);
    expect(
      scan('$brand = #ff8800\n.a\n  color: $brand\n', options).map((m) => m.raw),
    ).toEqual(['#ff8800']);
  });

  it('变量语言但不识别颜色名时, 变量仍然识别', () => {
    // 两个开关互不影响: matchWords 关掉颜色名, 变量引用照旧。
    const matches = scan('a { color: var(--brand); }', {
      matchWords: 'off',
      variableSyntax: true,
      resolveVariable: resolver({ '--brand': '#ff8800' }),
    });
    expect(matches.map((m) => m.raw)).toEqual(['var(--brand)']);
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

describe('变量引用', () => {
  it('三种写法各产出一个覆盖整个引用的 match', () => {
    const resolveAll = resolver({ '--brand': '#ff8800', $brand: '#ff8800', '@brand': '#ff8800' });
    for (const [text, syntax, variable] of [
      ['a { color: var(--brand); }', 'css-variable', '--brand'],
      ['a { color: $brand; }', 'scss-variable', '$brand'],
      ['a { color: @brand; }', 'less-variable', '@brand'],
    ] as const) {
      const matches = scan(text, { resolveVariable: resolveAll });
      expect(matches, text).toHaveLength(1);
      // syntax 保持引用形态; 取值来自变量因此标记只读。
      expect(matches[0].syntax).toBe(syntax);
      expect(matches[0].resolution).toBe('resolved');
      expect(matches[0].resolvedVia).toEqual({ variable });
      assertRawMatchesRange(text, matches);
    }
  });

  it('取值不唯一时的 contextual reason 区分自定义属性与预处理器变量', () => {
    const resolveAmbiguous = resolver({}, ['--brand', '$brand']);
    const custom = scan('a { color: var(--brand); }', { resolveVariable: resolveAmbiguous })[0];
    const preprocessor = scan('a { color: $brand; }', { resolveVariable: resolveAmbiguous })[0];
    expect(custom.resolution).toBe('contextual');
    expect(custom.contextual?.reason).toBe('css-variable');
    expect(preprocessor.contextual?.reason).toBe('preprocessor-variable');
    // 没有 assumed 值 → 高亮与色块都不会显示它们。
    expect(custom.contextual?.assumed).toBeUndefined();
  });

  it('at-rule 不被误判为 Less 变量', () => {
    expect(scan('@media screen { a { color: red; } }').every((m) => m.syntax !== 'less-variable')).toBe(
      true,
    );
    expect(scan('@import "x"; a { color: #ff8800; }').every((m) => m.syntax !== 'less-variable')).toBe(
      true,
    );
    expect(scan('@supports (color: red) { a { color: red; } }').every((m) => m.syntax !== 'less-variable')).toBe(
      true,
    );
  });

  it('Less 变量的定义位置不算引用', () => {
    // `@brand: #ff8800;` 里的 `@brand` 在属性名位置, 只有末尾那个引用才算。
    const matches = scan('@brand: #ff8800; a { color: @brand; }', {
      resolveVariable: resolver({ '@brand': '#ff8800' }),
    });
    expect(matches.filter((m) => m.syntax === 'less-variable')).toHaveLength(1);
    expect(matches.some((m) => m.syntax === 'hex')).toBe(true);
  });

  it('非 CSS 系语言中不识别变量引用', () => {
    expect(scan('a { color: $brand; }', { cssLikeLanguage: false })).toHaveLength(0);
    expect(scan('a { color: @brand; }', { cssLikeLanguage: false })).toHaveLength(0);
  });

  it('var() 的 fallback 不再单独成 match (整体范围更大, 去重时胜出)', () => {
    const text = 'a { color: var(--x, #ff8800); }';
    const matches = scan(text, { resolveVariable: resolver({ '--x': '#0000ff' }) });
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe('var(--x, #ff8800)');
    assertRawMatchesRange(text, matches);
  });

  it('不含自定义属性的 var() 不产出变量 match', () => {
    expect(scan('a { color: var(); }')).toHaveLength(0);
  });
});

describe('嵌套颜色', () => {
  it('var() 的 fallback 与嵌套 var() 全部进入 nested', () => {
    const text = 'a { color: var(--a, var(--b, #674), #def); }';
    // `--a` 有值 → 外层解析成功; `--b` 没有值 → 内层靠 fallback `#674` 成立。
    const matches = scan(text, { resolveVariable: resolver({ '--a': '#111111' }) });
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe('var(--a, var(--b, #674), #def)');
    expect(matches[0].nested?.map((match) => match.raw)).toEqual([
      'var(--b, #674)',
      '#674',
      '#def',
    ]);
    // 扁平存放: 最内层的 `#674` 直接挂在最外层上, 不需要递归。
    assertRawMatchesRange(text, matches[0].nested ?? []);
  });

  it('nested 的起点各不相同', () => {
    const matches = scan('a { color: var(--a, var(--b, #674), #def); }', {
      resolveVariable: resolver({ '--a': '#111111' }),
    });
    const starts = [matches[0], ...(matches[0].nested ?? [])].map((match) => match.range.start);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('颜色函数不下降, 内部颜色不进 nested', () => {
    const matches = scan('a { color: color-mix(in oklch, #ff8800, blue); }');
    expect(matches).toHaveLength(1);
    expect(matches[0].nested).toBeUndefined();
  });

  it('没有嵌套时 nested 为 undefined 而不是空数组', () => {
    expect(
      scan('a { color: var(--x); }', { resolveVariable: resolver({ '--x': '#ff8800' }) })[0].nested,
    ).toBeUndefined();
    expect(scan('a { color: #ff8800; }')[0].nested).toBeUndefined();
  });

  it('var() 首参不是自定义属性名时不产出变量 match', () => {
    // `var()` 的第一个实参必须是 <custom-property-name>; 这种写法本身非法,
    // 外层不成为候选, 内层仍各自被识别。
    const matches = scan('a { color: var(var(--def, #674), #def); }', {
      resolveVariable: resolver(),
    });
    expect(matches.map((match) => match.raw)).toEqual(['var(--def, #674)', '#def']);
  });
});

describe('颜色函数实参里的变量', () => {
  it('通道令牌代换回 rgb() 后解析成真实颜色', () => {
    // Tailwind 风格的令牌: `--text-tertiary: 148 163 184` 单独不是颜色, 只有代换回
    // `rgb(148 163 184 / 0.4)` 才成立。因此这里的 syntax 取代换后的真实语法。
    const text = 'a { background-color: rgb(var(--text-tertiary) / 0.4); }';
    const matches = scan(text, {
      resolveVariable: resolver({ '--text-tertiary': '148 163 184' }),
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe('rgb(var(--text-tertiary) / 0.4)');
    expect(matches[0].syntax).toBe('srgb');
    expect(matches[0].resolution).toBe('resolved');
    expect(matches[0].resolved?.alpha).toBeCloseTo(0.4, 4);
    expect(matches[0].resolvedVia).toEqual({ variable: '--text-tertiary' });
    // 内层 `var(--text-tertiary)` 自身取值是通道三元组而不是颜色, 因此不留空色块。
    expect(matches[0].nested).toBeUndefined();
    assertRawMatchesRange(text, matches);
  });

  it('取值不唯一时整段保留为 contextual, 而不是被丢掉', () => {
    const matches = scan('a { background-color: rgb(var(--t) / 0.4); }', {
      resolveVariable: resolver({}, ['--t']),
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].resolution).toBe('contextual');
    expect(matches[0].contextual?.dependsOn).toBe('--t');
    expect(matches[0].resolved).toBeUndefined();
  });

  it('legacy 逗号写法与其他颜色函数同样生效', () => {
    const resolveAll = resolver({ '--x': '255, 0, 0', '--h': '210', '--a': '#ff8800' });
    for (const [text, syntax] of [
      ['a { color: rgba(var(--x), 0.4); }', 'legacy-rgb'],
      ['a { color: hsl(var(--h) 50% 50%); }', 'hsl'],
      ['a { color: color-mix(in srgb, var(--a), red); }', 'color-mix'],
    ] as const) {
      const matches = scan(text, { resolveVariable: resolveAll });
      expect(matches, text).toHaveLength(1);
      expect(matches[0].resolution, text).toBe('resolved');
      expect(matches[0].syntax, text).toBe(syntax);
    }
  });

  it('多个引用全部记入 resolvedVia', () => {
    const matches = scan('a { color: rgb(var(--r) var(--g) var(--b)); }', {
      resolveVariable: resolver({ '--r': '1', '--g': '2', '--b': '3' }),
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].resolution).toBe('resolved');
    expect(matches[0].resolvedVia).toEqual({ variable: '--r, --g, --b' });
  });

  it('实参里的 var() 取不到值时用 fallback', () => {
    const matches = scan('a { color: rgb(var(--x, 1 2 3) / 0.4); }', { resolveVariable: resolver() });
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe('srgb');
    expect(matches[0].resolution).toBe('resolved');
  });

  it('一个引用取不到值时整段不产出 match', () => {
    expect(scan('a { color: rgb(var(--missing) / 0.4); }', { resolveVariable: resolver() })).toEqual([]);
  });

  it('预处理器变量作为实参: 顶层不解析, 内层引用仍有自己的 match', () => {
    // `rgba($brand, .4)` 代换后是 SCSS 的 `rgba(颜色, alpha)` 重载而不是 CSS 语法,
    // 因此顶层不解析; 但内层 `$brand` 该有自己的色块。
    const matches = scan('a { color: rgba($brand, 0.4); }', {
      resolveVariable: resolver({ $brand: '#ff8800' }),
    });
    expect(matches.map((match) => match.raw)).toEqual(['$brand']);
    expect(matches[0].syntax).toBe('scss-variable');
  });

  it('不含变量的颜色函数行为不变', () => {
    const matches = scan('a { color: rgb(1 2 3 / 0.4); }');
    expect(matches).toHaveLength(1);
    expect(matches[0].syntax).toBe('srgb');
    expect(matches[0].resolution).toBe('resolved');
    expect(matches[0].nested).toBeUndefined();
  });
});
