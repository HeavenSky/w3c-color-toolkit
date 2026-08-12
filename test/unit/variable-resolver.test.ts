/**
 * 变量查表的三态判定。
 *
 * 这里锁定新旧行为的分界: 旧实现把"有定义但取值不唯一"和"没有定义"混成同一个失败,
 * 于是多主题令牌被整条丢掉; 新实现把前者变成带候选的 `ambiguous`, 后者才是 `unresolved`。
 */
import { describe, expect, it } from 'vitest';

import { collectStylesheet } from '../../src/adapters/variable-definitions.js';
import { emptySymbols, lookupVariable } from '../../src/adapters/variable-resolver.js';
import type { LookupSite, TextDocumentLike, VariableDefinition, VariableSymbols } from '../../src/adapters/types.js';

function doc(text: string, languageId = 'css', uri = 'file:///w/a.css'): TextDocumentLike {
  return { uri, languageId, getText: () => text };
}

/** 把若干文档收集成一张符号表, 与索引层的组装方式一致。 */
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

const AT_END: LookupSite = { fromUri: 'file:///w/a.css', atOffset: Number.MAX_SAFE_INTEGER };

describe('自定义属性', () => {
  it('唯一的无条件 root 定义可解析', () => {
    const lookup = lookupVariable('--a', AT_END, symbolsOf(doc(':root { --a: #ff8800 }')));
    expect(lookup).toEqual({ kind: 'resolved', rawValue: '#ff8800', sourceUri: 'file:///w/a.css' });
  });

  it('@layer 内的 :root 仍算无条件 (常见于 Tailwind 项目)', () => {
    const lookup = lookupVariable(
      '--border',
      AT_END,
      symbolsOf(doc('@layer base {\n  /* shadcn fallbacks */\n  :root { --border: 214.3 31.8% 91.4% }\n}')),
    );
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: '214.3 31.8% 91.4%' });
  });

  it('prefers-color-scheme 双 :root 给出两个候选而不是失败', () => {
    const lookup = lookupVariable(
      '--a',
      AT_END,
      symbolsOf(doc(':root { --a: #fff }\n@media (prefers-color-scheme: dark) { :root { --a: #000 } }')),
    );
    expect(lookup.kind).toBe('ambiguous');
    expect(lookup.kind === 'ambiguous' && lookup.candidates).toEqual([
      { rawValue: '#fff', origin: ':root', sourceUri: 'file:///w/a.css' },
      {
        rawValue: '#000',
        origin: '@media (prefers-color-scheme: dark) › :root',
        sourceUri: 'file:///w/a.css',
      },
    ]);
  });

  it('root 定义 + 组件级局部覆盖仍按 root 解析 (局部定义只影响匹配的元素)', () => {
    const lookup = lookupVariable(
      '--brand',
      AT_END,
      symbolsOf(doc(':root { --brand: #ff8800 }\n.button { --brand: #0000ff }')),
    );
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: '#ff8800' });
  });

  it('只有非 root 定义时给出候选, 而不是被整条丢掉', () => {
    const lookup = lookupVariable(
      '--text-tertiary',
      AT_END,
      symbolsOf(
        doc(
          '[data-product="hui"] { --text-tertiary: 148 163 184 }\n' +
            '[data-product="hui"].dark { --text-tertiary: 120 113 108 }\n' +
            '[data-product="ea"] { --text-tertiary: 120 113 108 }',
          'css',
          'file:///w/tokens.css',
        ),
      ),
    );
    expect(lookup.kind).toBe('ambiguous');
    expect(lookup.kind === 'ambiguous' && lookup.candidates.map((c) => c.origin)).toEqual([
      '[data-product="hui"]',
      '[data-product="hui"].dark',
      '[data-product="ea"]',
    ]);
  });

  it('多个 root 定义时不猜 cascade 胜者', () => {
    const lookup = lookupVariable(
      '--a',
      AT_END,
      symbolsOf(doc(':root { --a: red }', 'css', 'file:///w/a.css'), doc(':root { --a: blue }', 'css', 'file:///w/b.css')),
    );
    expect(lookup.kind).toBe('ambiguous');
    expect(lookup.kind === 'ambiguous' && lookup.candidates.map((c) => c.sourceUri)).toEqual([
      'file:///w/a.css',
      'file:///w/b.css',
    ]);
  });

  it('跨文件的唯一 root 定义可解析 (不需要 @import)', () => {
    const lookup = lookupVariable(
      '--brand',
      { fromUri: 'file:///w/globals.css', atOffset: 0 },
      symbolsOf(
        doc('a { color: var(--brand) }', 'css', 'file:///w/globals.css'),
        doc(':root { --brand: #ff8800 }', 'css', 'file:///w/tokens.css'),
      ),
    );
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: '#ff8800', sourceUri: 'file:///w/tokens.css' });
  });

  it('没有定义时是 unresolved', () => {
    expect(lookupVariable('--missing', AT_END, symbolsOf(doc(':root { --a: red }')))).toEqual({
      kind: 'unresolved',
      reason: 'no-definition',
    });
  });

  it('空符号表不抛', () => {
    expect(lookupVariable('--a', AT_END, emptySymbols()).kind).toBe('unresolved');
  });
});

describe('预处理器变量', () => {
  const scssUri = 'file:///w/a.scss';

  it('取引用位置之前的最后一个定义', () => {
    const text = '$a: red;\n$a: blue;\n.x { color: $a }';
    const symbols = symbolsOf(doc(text, 'scss', scssUri));
    const lookup = lookupVariable('$a', { fromUri: scssUri, atOffset: text.indexOf('color') }, symbols);
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: 'blue' });
  });

  it('位置之前没有定义时不解析', () => {
    const text = '.x { color: $a }\n$a: red;';
    const symbols = symbolsOf(doc(text, 'scss', scssUri));
    const lookup = lookupVariable('$a', { fromUri: scssUri, atOffset: text.indexOf('color') }, symbols);
    expect(lookup).toEqual({ kind: 'unresolved', reason: 'no-definition' });
  });

  it('顶层定义优先于嵌套在选择器里的定义', () => {
    const text = '$a: red;\n.y { $a: green; }\n.x { color: $a }';
    const symbols = symbolsOf(doc(text, 'scss', scssUri));
    const lookup = lookupVariable('$a', { fromUri: scssUri, atOffset: text.lastIndexOf('$a') }, symbols);
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: 'red' });
  });

  it('跨文件唯一定义可解析', () => {
    const symbols = symbolsOf(
      doc('.x { color: $brand }', 'scss', scssUri),
      doc('$brand: #ff8800;', 'scss', 'file:///w/_vars.scss'),
    );
    expect(lookupVariable('$brand', { fromUri: scssUri, atOffset: 0 }, symbols)).toMatchObject({
      kind: 'resolved',
      rawValue: '#ff8800',
    });
  });

  it('跨文件多个定义无从判断顺序, 给候选', () => {
    const symbols = symbolsOf(
      doc('.x { color: $brand }', 'scss', scssUri),
      doc('$brand: red;', 'scss', 'file:///w/_a.scss'),
      doc('$brand: blue;', 'scss', 'file:///w/_b.scss'),
    );
    const lookup = lookupVariable('$brand', { fromUri: scssUri, atOffset: 0 }, symbols);
    expect(lookup.kind).toBe('ambiguous');
    expect(lookup.kind === 'ambiguous' && lookup.candidates).toHaveLength(2);
  });

  it('Less 的 @ 变量同样走顺序求值', () => {
    const text = '@brand: #ff8800;\n.x { color: @brand }';
    const symbols = symbolsOf(doc(text, 'less', 'file:///w/a.less'));
    const lookup = lookupVariable(
      '@brand',
      { fromUri: 'file:///w/a.less', atOffset: text.lastIndexOf('@brand') },
      symbols,
    );
    expect(lookup).toMatchObject({ kind: 'resolved', rawValue: '#ff8800' });
  });

  it('Stylus 不再有变量定义可查 (方案 D3)', () => {
    const symbols = symbolsOf(doc('$brand = #ff8800\n.a\n  color: $brand\n', 'stylus', 'file:///w/a.styl'));
    expect(lookupVariable('$brand', { fromUri: 'file:///w/a.styl', atOffset: 40 }, symbols)).toEqual({
      kind: 'unresolved',
      reason: 'no-definition',
    });
  });
});

describe('@color-profile', () => {
  it('fallback 以原始文本进入符号表', () => {
    const symbols = symbolsOf(doc('@color-profile --p { fallback: #123456 }'));
    expect(symbols.colorProfileFallbacks.get('--p')).toBe('#123456');
  });
});
