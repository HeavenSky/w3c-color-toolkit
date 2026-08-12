import { describe, expect, it, vi } from 'vitest';

import { ChangeCoalescer } from '../../src/index/change-coalescer.js';
import { DocumentColorIndex } from '../../src/index/document-color-index.js';
import { collectStylesheet } from '../../src/adapters/variable-definitions.js';
import { lookupVariable, toVariableValue } from '../../src/adapters/variable-resolver.js';
import type { VariableDefinition, VariableSymbols } from '../../src/adapters/types.js';
import type { ScanOptions } from '../../src/core/scanner.js';
import type { ResolveVariable } from '../../src/core/types.js';

import { DEFAULT_PARSE_OPTIONS } from './helpers.js';

const OPTIONS: ScanOptions = {
  ...DEFAULT_PARSE_OPTIONS,
  matchWords: 'css-like',
  cssLikeLanguage: true,
  scanComments: true,
  scanStrings: true,
  maxMatches: 10000,
};

const TEXT = 'a { color: #ff8800; background: rgb(0 0 0); }';

describe('DocumentColorIndex', () => {
  it('同一版本只扫描一次', () => {
    const index = new DocumentColorIndex();
    const parts = { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 };
    index.ensure(TEXT, parts, OPTIONS);
    index.ensure(TEXT, parts, OPTIONS);
    index.ensure(TEXT, parts, OPTIONS);
    expect(index.scans).toBe(1);
    expect(index.current?.matches).toHaveLength(2);
  });

  it('文档版本变化后重新扫描', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    index.ensure(TEXT, { documentVersion: 2, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    expect(index.scans).toBe(2);
  });

  it('配置摘要变化后重新扫描', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'b', variableContextVersion: 0 }, OPTIONS);
    expect(index.scans).toBe(2);
  });

  it('变量上下文版本变化后重新扫描', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'a', variableContextVersion: 1 }, OPTIONS);
    expect(index.scans).toBe(2);
  });

  it('旧版本的异步结果不会被提交', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 5, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    const accepted = index.accept({
      documentVersion: 3,
      configDigest: 'a',
      variableContextVersion: 0,
      matches: [],
      truncated: false,
    });
    expect(accepted).toBe(false);
    expect(index.current?.documentVersion).toBe(5);
  });

  it('同版本或更新的结果可以提交', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 5, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    expect(
      index.accept({
        documentVersion: 6,
        configDigest: 'a',
        variableContextVersion: 0,
        matches: [],
        truncated: false,
      }),
    ).toBe(true);
    expect(index.current?.matches).toHaveLength(0);
  });

  it('findAtOffset 与 findInRange 共享同一份 match', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    expect(index.findAtOffset(12)?.raw).toBe('#ff8800');
    expect(index.findInRange(0, TEXT.length)).toHaveLength(2);
    expect(index.findInRange(0, 5)).toHaveLength(0);
  });

  it('invalidate 后重新扫描', () => {
    const index = new DocumentColorIndex();
    const parts = { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 };
    index.ensure(TEXT, parts, OPTIONS);
    index.invalidate();
    expect(index.current).toBeUndefined();
    index.ensure(TEXT, parts, OPTIONS);
    expect(index.scans).toBe(2);
  });

  it('isFreshFor 只比较文档版本', () => {
    const index = new DocumentColorIndex();
    index.ensure(TEXT, { documentVersion: 7, configDigest: 'a', variableContextVersion: 0 }, OPTIONS);
    expect(index.isFreshFor(7)).toBe(true);
    expect(index.isFreshFor(8)).toBe(false);
  });
});

describe('ChangeCoalescer', () => {
  it('窗口内的重复变更被合并为一次执行', async () => {
    vi.useFakeTimers();
    const coalescer = new ChangeCoalescer(120);
    const run = vi.fn();
    coalescer.schedule('a', run);
    coalescer.schedule('a', run);
    coalescer.schedule('a', run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('不同 key 互不影响', () => {
    vi.useFakeTimers();
    const coalescer = new ChangeCoalescer(120);
    const a = vi.fn();
    const b = vi.fn();
    coalescer.schedule('a', a);
    coalescer.schedule('b', b);
    vi.advanceTimersByTime(120);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancel 阻止执行', () => {
    vi.useFakeTimers();
    const coalescer = new ChangeCoalescer(120);
    const run = vi.fn();
    coalescer.schedule('a', run);
    expect(coalescer.pending('a')).toBe(true);
    coalescer.cancel('a');
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    expect(coalescer.pending('a')).toBe(false);
    vi.useRealTimers();
  });

  it('dispose 清空全部待执行任务', () => {
    vi.useFakeTimers();
    const coalescer = new ChangeCoalescer(120);
    const run = vi.fn();
    coalescer.schedule('a', run);
    coalescer.schedule('b', run);
    coalescer.dispose();
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

/** 把一段文本收集成符号表, 与索引层的组装方式一致。 */
function symbolsOf(text: string, languageId: string, uri: string): VariableSymbols {
  const definitions = new Map<string, VariableDefinition[]>();
  for (const definition of collectStylesheet({ uri, languageId, getText: () => text }).definitions) {
    const list = definitions.get(definition.name) ?? [];
    list.push(definition);
    definitions.set(definition.name, list);
  }
  return { definitions, colorProfileFallbacks: new Map(), version: 1 };
}

function resolverFor(text: string, languageId: string, uri: string): ResolveVariable {
  const symbols = symbolsOf(text, languageId, uri);
  return (name, atOffset) => toVariableValue(lookupVariable(name, { fromUri: uri, atOffset }, symbols));
}

describe('变量解析在索引层的接入', () => {
  const URI = 'file:///a.scss';
  const VARS = '$brand: #ff8800; a { color: $brand; }';
  const SCSS: ScanOptions = { ...OPTIONS, cssLikeLanguage: true };
  const parts = { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 };

  it('没有取值回调时变量引用被静默移除', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, SCSS);
    // 只剩定义处那个 hex; `color: $brand` 的引用不产生任何输出。
    expect(snapshot.matches.map((match) => match.raw)).toEqual(['#ff8800']);
  });

  it('接上回调后变量引用在扫描期就地解析并标记只读', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, {
      ...SCSS,
      resolveVariable: resolverFor(VARS, 'scss', URI),
    });
    const variable = snapshot.matches.find((match) => match.raw === '$brand');
    expect(variable?.resolution).toBe('resolved');
    expect(variable?.resolvedVia).toEqual({ variable: '$brand' });
  });

  it('查不到定义的变量仍被移除', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, {
      ...SCSS,
      resolveVariable: resolverFor('$other: #ff8800;', 'scss', URI),
    });
    expect(snapshot.matches.map((match) => match.raw)).toEqual(['#ff8800']);
  });

  it('异步结果经 accept 写回, 过期版本被拒绝', () => {
    // 变量已改为同步解析, 但 accept 仍是索引的通用写回闸门 (命令与后台刷新会用到)。
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, { ...parts, documentVersion: 5 }, SCSS);
    const replaced = { ...snapshot, matches: [] };
    expect(index.accept({ ...replaced, documentVersion: 4 })).toBe(false);
    expect(index.accept(replaced)).toBe(true);
  });
});

describe('嵌套 match 的查找', () => {
  const SCSS: ScanOptions = { ...OPTIONS, cssLikeLanguage: true };
  const parts = { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 };
  const TEXT_WITH_NESTED = 'a { color: var(--x, #123456); }';

  /** `--x` 有唯一 :root 定义, 外层因此解析成功并保留其 nested。 */
  const RESOLVE = resolverFor(':root { --x: #ff8800 }', 'css', 'file:///a.css');

  function indexed(): DocumentColorIndex {
    const index = new DocumentColorIndex();
    index.ensure(TEXT_WITH_NESTED, parts, { ...SCSS, resolveVariable: RESOLVE });
    return index;
  }

  it('外层解析成功后仍保留 nested', () => {
    const outer = indexed().current?.matches[0];
    expect(outer?.raw).toBe('var(--x, #123456)');
    expect(outer?.resolvedVia).toEqual({ variable: '--x' });
    expect(outer?.nested?.map((match) => match.raw)).toEqual(['#123456']);
  });

  it('落在内层时返回内层, 而不是包含它的外层', () => {
    const index = indexed();
    const inner = index.current?.matches[0].nested?.[0];
    expect(inner?.raw).toBe('#123456');
    expect(index.findAtOffset(inner!.range.start)?.raw).toBe('#123456');
  });

  it('落在外层但不在内层时返回外层', () => {
    expect(indexed().findAtOffset(11)?.raw).toBe('var(--x, #123456)');
  });

  it('findInRange 同时给出外层与内层, 供精确 range 匹配挑选', () => {
    const found = indexed()
      .findInRange(0, TEXT_WITH_NESTED.length)
      .map((match) => match.raw);
    expect(found).toEqual(['var(--x, #123456)', '#123456']);
  });

  it('外层解析失败时内层上浮为顶层, 仍可被查到', () => {
    const index = new DocumentColorIndex();
    // 不传上下文: 外层变量被移除, 内层 hex 顶上来。
    index.ensure(TEXT_WITH_NESTED, parts, SCSS);
    expect(index.current?.matches.map((match) => match.raw)).toEqual(['#123456']);
    expect(index.findAtOffset(20)?.raw).toBe('#123456');
  });
});
