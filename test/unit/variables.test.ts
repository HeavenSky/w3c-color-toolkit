/**
 * 变量解析的端到端行为 (扫描期同步查表)。
 *
 * 这里锁定四条约定:
 * - 取值确定 → 解析成真实颜色, 并带 `resolvedVia` 供转换与取色器判定只读;
 * - 取值不唯一 (`ambiguous`) → 保留为 contextual, 不给色块也不被丢弃;
 * - 没有定义 → **整条移除**, 而不是留一个没有颜色的 match (否则 SCSS 里每个 `$foo`
 *   都会弹出 Hover 面板, 而改造前它们什么都不弹);
 * - 没有取值回调 (关闭变量解析 / 非变量语言) → 与"没有定义"同样静默。
 */
import { describe, expect, it } from 'vitest';

import { collectStylesheet } from '../../src/adapters/variable-definitions.js';
import { lookupVariable, toVariableValue } from '../../src/adapters/variable-resolver.js';
import type { TextDocumentLike, VariableDefinition, VariableSymbols } from '../../src/adapters/types.js';
import { scanText, type ScanOptions } from '../../src/core/scanner.js';
import type { ColorMatch, ResolveVariable } from '../../src/core/types.js';
import { convertSource, type ConvertPolicy } from '../../src/features/convert/presentations.js';

import { DEFAULT_PARSE_OPTIONS } from './helpers.js';

const URI = 'file:///w/a.css';

const BASE: ScanOptions = {
  ...DEFAULT_PARSE_OPTIONS,
  matchWords: 'css-like',
  cssLikeLanguage: true,
  scanComments: true,
  scanStrings: true,
  maxMatches: 1000,
};

/** 把若干文档收集成符号表, 与索引层的组装方式一致。 */
function symbolsOf(...documents: readonly TextDocumentLike[]): VariableSymbols {
  const definitions = new Map<string, VariableDefinition[]>();
  const colorProfileFallbacks = new Map<string, string>();
  for (const document of documents) {
    const collected = collectStylesheet(document);
    for (const definition of collected.definitions) {
      const list = definitions.get(definition.name) ?? [];
      list.push(definition);
      definitions.set(definition.name, list);
    }
    for (const fallback of collected.colorProfileFallbacks) {
      colorProfileFallbacks.set(fallback.name, fallback.rawValue);
    }
  }
  return { definitions, colorProfileFallbacks, version: 1 };
}

function resolverFor(symbols: VariableSymbols, fromUri = URI): ResolveVariable {
  return (name, atOffset) => toVariableValue(lookupVariable(name, { fromUri, atOffset }, symbols));
}

/** 用给定符号表扫描一段文本; 符号表缺省表示没有任何定义。 */
function scan(
  text: string,
  options: { readonly symbols?: VariableSymbols; readonly languageId?: string; readonly withResolver?: boolean } = {},
): readonly ColorMatch[] {
  const documents: TextDocumentLike[] = [
    { uri: URI, languageId: options.languageId ?? 'css', getText: () => text },
  ];
  const symbols = options.symbols ?? symbolsOf(...documents);
  const withResolver = options.withResolver ?? true;
  return scanText(text, {
    ...BASE,
    resolveVariable: withResolver ? resolverFor(symbols) : undefined,
  }).matches;
}

describe('取值确定', () => {
  it('唯一 :root 定义的引用解析成颜色并标记只读', () => {
    const matches = scan(':root { --brand: #ff8800 }\na { color: var(--brand) }');
    const reference = matches.find((match) => match.raw === 'var(--brand)');
    expect(reference?.resolution).toBe('resolved');
    // syntax 保持引用形态: 这段文本的源语法确实是"一个引用"。
    expect(reference?.syntax).toBe('css-variable');
    expect(reference?.resolvedVia).toEqual({ variable: '--brand' });
    expect(reference?.contextual).toBeUndefined();
  });

  it('通道令牌代换回颜色函数后解析成功', () => {
    const matches = scan(':root { --c: 148 163 184 }\na { background-color: rgb(var(--c) / 0.4) }');
    const fn = matches.find((match) => match.raw === 'rgb(var(--c) / 0.4)');
    expect(fn?.resolution).toBe('resolved');
    // 这里的源语法确实是 rgb(), 因此取代换后的真实语法而不是引用形态。
    expect(fn?.syntax).toBe('srgb');
    expect(fn?.resolved?.alpha).toBeCloseTo(0.4, 4);
    expect(fn?.resolvedVia).toEqual({ variable: '--c' });
  });

  it('变量的值本身含 var() 时继续代换', () => {
    const matches = scan(':root { --a: var(--b); --b: #ff8800 }\nx { color: var(--a) }');
    const reference = matches.find((match) => match.raw === 'var(--a)');
    expect(reference?.resolution).toBe('resolved');
  });

  it('同一变量在实参里重复出现不被误判为循环', () => {
    const matches = scan(':root { --n: 10 }\na { color: rgb(var(--n) var(--n) var(--n)) }');
    expect(matches.find((match) => match.raw.startsWith('rgb('))?.resolution).toBe('resolved');
  });

  it('循环引用不产出 match', () => {
    const matches = scan(':root { --a: var(--b); --b: var(--a) }\nx { color: var(--a) }');
    expect(matches.some((match) => match.raw === 'var(--a)')).toBe(false);
  });

  it('引用不可解析但有 fallback 时按 fallback 解析', () => {
    const matches = scan('a { color: rgb(var(--missing, 148 163 184) / 0.4) }');
    expect(matches.find((match) => match.raw.startsWith('rgb('))?.resolution).toBe('resolved');
  });

  it('预处理器变量按顺序求值', () => {
    const text = '$brand: #ff8800;\n.x { color: $brand }';
    const document: TextDocumentLike = { uri: URI, languageId: 'scss', getText: () => text };
    const matches = scanText(text, {
      ...BASE,
      resolveVariable: resolverFor(symbolsOf(document)),
    }).matches;
    const reference = matches.filter((match) => match.raw === '$brand');
    // 定义处那个 `$brand` 在属性名位置, 不算引用; 只有末尾的引用产出 match。
    expect(reference).toHaveLength(1);
    expect(reference[0].resolution).toBe('resolved');
    expect(reference[0].syntax).toBe('scss-variable');
  });
});

describe('取值不唯一', () => {
  it('prefers-color-scheme 双 :root: 保留为 contextual, 不给颜色', () => {
    const matches = scan(
      ':root { --a: #fff }\n@media (prefers-color-scheme: dark) { :root { --a: #000 } }\nx { color: var(--a) }',
    );
    const reference = matches.find((match) => match.raw === 'var(--a)');
    expect(reference?.resolution).toBe('contextual');
    expect(reference?.resolved).toBeUndefined();
    expect(reference?.contextual?.reason).toBe('css-variable');
    expect(reference?.contextual?.dependsOn).toBe('--a');
    // 没有 assumed 值, 因此高亮与色块都不会显示它。
    expect(reference?.contextual?.assumed).toBeUndefined();
  });

  it('只有非 root 定义时同样保留为 contextual 而不是被丢弃', () => {
    const tokens: TextDocumentLike = {
      uri: 'file:///w/tokens.css',
      languageId: 'css',
      getText: () => '[data-product="hui"] { --t: 148 163 184 }\n[data-product="ea"] { --t: 120 113 108 }',
    };
    const text = 'a { color: rgb(var(--t)) }';
    const matches = scanText(text, {
      ...BASE,
      resolveVariable: resolverFor(symbolsOf(tokens)),
    }).matches;
    const fn = matches.find((match) => match.raw === 'rgb(var(--t))');
    expect(fn?.resolution).toBe('contextual');
    expect(fn?.contextual?.dependsOn).toBe('--t');
  });
});

describe('静默移除', () => {
  it('没有定义的引用不产出任何 match', () => {
    expect(scan('a { color: var(--missing) }')).toEqual([]);
  });

  it('没有取值回调时变量引用同样静默', () => {
    const matches = scan(':root { --brand: #ff8800 }\na { color: var(--brand) }', {
      withResolver: false,
    });
    // 只剩定义处那个 hex。
    expect(matches.map((match) => match.raw)).toEqual(['#ff8800']);
  });

  it('值不是颜色时不产出 match', () => {
    // 通道三元组单独不是颜色; 只有代换进 rgb() 才成立。
    expect(scan(':root { --c: 148 163 184 }\na { color: var(--c) }')).toEqual([]);
  });

  it('外层函数解析不出来时, 内层引用仍保留自己的 match', () => {
    // `rgb(#ff8800)` 不是合法 CSS, 因此外层作废; 内层 `var(--brand)` 是真颜色。
    const matches = scan(':root { --brand: #ff8800 }\na { color: rgb(var(--brand)) }');
    expect(matches.map((match) => match.raw)).toEqual(['#ff8800', 'var(--brand)']);
    expect(matches[1].resolvedVia).toEqual({ variable: '--brand' });
  });
});

describe('嵌套', () => {
  it('fallback 里的实色作为 nested 保留', () => {
    // 第一个 match 是定义处 `--x: #ff8800` 里那个 hex, 它本来就是一个独立 match。
    const matches = scan(':root { --x: #ff8800 }\na { color: var(--x, #123456) }');
    const reference = matches.find((match) => match.raw === 'var(--x, #123456)');
    expect(reference?.resolution).toBe('resolved');
    expect(reference?.nested?.map((match) => match.raw)).toEqual(['#123456']);
  });

  it('解析不出来的外层引用被移除时, 嵌套实色仍然保留', () => {
    const matches = scan('a { color: var(--missing, #123456) }');
    // 外层引用没有定义, 但 fallback 是 CSS 语义下真正生效的颜色。
    expect(matches.map((match) => match.raw)).toEqual(['var(--missing, #123456)']);
    expect(matches[0].resolution).toBe('resolved');
  });
});

describe('只读约束', () => {
  const POLICY: ConvertPolicy = {
    alphaLoss: 'reject',
    missingComponentLoss: 'confirm',
    namedColorFallback: 'reject',
    allowAssumedContextual: false,
  };

  it('带 resolvedVia 的 match 被转换拒绝, 并给出所依赖的变量名', () => {
    const matches = scan(':root { --brand: #ff8800 }\na { color: var(--brand) }');
    const reference = matches.find((match) => match.raw === 'var(--brand)');
    const result = convertSource(reference as ColorMatch, POLICY);
    expect('rejection' in result).toBe(true);
    if ('rejection' in result) {
      expect(result.rejection).toEqual({ kind: 'contextual', detail: '--brand' });
    }
  });
});
