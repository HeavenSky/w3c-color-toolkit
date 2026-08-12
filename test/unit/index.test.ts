import { describe, expect, it, vi } from 'vitest';

import { ChangeCoalescer } from '../../src/index/change-coalescer.js';
import { DocumentColorIndex } from '../../src/index/document-color-index.js';
import type { VariableContext } from '../../src/adapters/types.js';
import type { ScanOptions } from '../../src/core/scanner.js';

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

describe('变量解析在索引层的接入', () => {
  const VARS = '$brand: #ff8800; a { color: $brand; }';
  const SCSS: ScanOptions = { ...OPTIONS, cssLikeLanguage: true };
  const parts = { documentVersion: 1, configDigest: 'a', variableContextVersion: 0 };

  function contextWith(name: string, rawValue: string): VariableContext {
    return {
      definitions: new Map([
        [name, [{ name, kind: 'scss', rawValue, sourceUri: 'file:///a.scss', offset: 0 }]],
      ]),
      colorProfileFallbacks: new Map(),
      version: 0,
      issues: [],
    };
  }

  it('不传变量上下文时变量引用被静默移除', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, SCSS);
    // 只剩定义处那个 hex; `color: $brand` 的引用不产生任何输出。
    expect(snapshot.matches.map((match) => match.raw)).toEqual(['#ff8800']);
  });

  it('传入上下文后变量引用被解析并标记只读', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, SCSS, {
      context: contextWith('$brand', '#ff8800'),
      maxResolveDepth: 20,
    });
    const variable = snapshot.matches.find((match) => match.raw === '$brand');
    expect(variable?.resolution).toBe('resolved');
    expect(variable?.resolvedVia).toEqual({ variable: '$brand' });
  });

  it('解析不出来的变量仍被移除', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, parts, SCSS, {
      context: contextWith('$other', '#ff8800'),
      maxResolveDepth: 20,
    });
    expect(snapshot.matches.map((match) => match.raw)).toEqual(['#ff8800']);
  });

  it('异步补丁的结果经 accept 写回, 过期版本被拒绝', () => {
    const index = new DocumentColorIndex();
    const snapshot = index.ensure(VARS, { ...parts, documentVersion: 5 }, SCSS);
    const patched = { ...snapshot, matches: [] };
    // 文档已经改到版本 6, 补丁基于版本 5 的结果, 但 accept 只挡更旧的版本。
    expect(index.accept({ ...patched, documentVersion: 4 })).toBe(false);
    expect(index.accept(patched)).toBe(true);
  });
});
