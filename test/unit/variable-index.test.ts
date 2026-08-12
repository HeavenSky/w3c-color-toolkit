/**
 * 工作区变量索引。
 *
 * 这里锁定新架构最关键的一条能力: **定义不必经 `@import` 就能被发现**。
 * 改造前只跟 `@import` 图, 因此"样式文件由 JS/TS 侧 import 合并"的项目 (Vite / Next 的
 * 主流写法) 里, 令牌文件形同不存在; 而那条跨文件路径本身还因为调度条件恒假从未生效。
 *
 * 同时锁定三条边界: 每个 uri 只有一条记录 (脏文档不与磁盘版本并存)、超上限时截断并可上报、
 * 单文件超长时跳过。
 */
import { describe, expect, it } from 'vitest';

import { lookupVariable } from '../../src/adapters/variable-resolver.js';
import {
  WorkspaceVariableIndex,
  languageIdForUri,
  type VariableIndexOptions,
} from '../../src/adapters/workspace-variable-index.js';
import type { StyleFileEvent, StyleFileSource } from '../../src/adapters/types.js';

const GLOBS = ['**/*.{css,scss,sass,less}'];

interface MemorySource extends StyleFileSource {
  readonly files: Map<string, string>;
  emit(event: StyleFileEvent): void;
  readonly reads: string[];
}

function memorySource(files: Record<string, string>): MemorySource {
  const map = new Map(Object.entries(files));
  const listeners = new Set<(event: StyleFileEvent) => void>();
  const reads: string[] = [];
  return {
    files: map,
    reads,
    async list(_globs, maxFiles) {
      const uris = [...map.keys()].sort();
      return { uris: uris.slice(0, maxFiles), truncated: uris.length > maxFiles };
    },
    async read(uri) {
      reads.push(uri);
      return map.get(uri);
    },
    resolveImport(fromUri, specifier) {
      // 与真实实现同构的最小版本: 相对当前文件解析, 允许省略扩展名。
      const base = fromUri.slice(0, fromUri.lastIndexOf('/') + 1);
      const target = `${base}${specifier}`;
      return [target, `${target}.css`, `${target}.scss`];
    },
    watch(_globs, listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
  };
}

const OPTIONS: VariableIndexOptions = { lookupGlobs: GLOBS, maxIndexedFiles: 100 };

describe('发现范围', () => {
  it('未经 @import 的文件, 其 :root 定义可被别的文件引用解析', async () => {
    // globals.css 与 tokens.css 之间没有任何 CSS 层面的关联 —— 现实中它们由 JS 侧 import 合并。
    const source = memorySource({
      'file:///w/globals.css': 'a { color: rgb(var(--text) / 0.4) }',
      'file:///w/tokens.css': ':root { --text: 148 163 184 }',
    });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();

    expect(index.stats.files).toBe(2);
    expect(
      lookupVariable('--text', { fromUri: 'file:///w/globals.css', atOffset: 0 }, index.symbols()),
    ).toMatchObject({ kind: 'resolved', rawValue: '148 163 184', sourceUri: 'file:///w/tokens.css' });
  });

  it('@import 指向但未被 glob 命中的文件会被补充进索引', async () => {
    const source = memorySource({ 'file:///w/a.css': '@import "hidden";\n' });
    source.files.set('file:///w/hidden.css', ':root { --a: red }');
    // list 只报 a.css, 模拟 hidden.css 被 glob 排除。
    const index = new WorkspaceVariableIndex(
      {
        ...source,
        async list() {
          return { uris: ['file:///w/a.css'], truncated: false };
        },
      },
      OPTIONS,
    );
    await index.build();

    expect(index.stats.files).toBe(2);
    expect(lookupVariable('--a', { fromUri: 'file:///w/a.css', atOffset: 0 }, index.symbols())).toMatchObject({
      kind: 'resolved',
      rawValue: 'red',
    });
  });

  it('循环导入不会无限展开', async () => {
    const source = memorySource({
      'file:///w/a.css': '@import "b";\n:root { --a: red }',
      'file:///w/b.css': '@import "a";\n:root { --b: blue }',
    });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    expect(index.stats.files).toBe(2);
  });

  it('不可索引的扩展名被忽略', async () => {
    expect(languageIdForUri('file:///w/a.styl')).toBeUndefined();
    expect(languageIdForUri('file:///w/a.css')).toBe('css');
    expect(languageIdForUri('file:///w/a.SCSS')).toBe('scss');

    const source = memorySource({ 'file:///w/a.styl': '$brand = #ff8800' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    expect(index.stats.files).toBe(0);
  });
});

describe('上限与降级', () => {
  it('超过 maxIndexedFiles 时截断并可上报', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i += 1) files[`file:///w/${i}.css`] = `:root { --v${i}: red }`;
    const index = new WorkspaceVariableIndex(memorySource(files), {
      lookupGlobs: GLOBS,
      maxIndexedFiles: 2,
    });
    await index.build();

    expect(index.stats.files).toBe(2);
    expect(index.stats.truncated).toBe(true);
  });

  it('单文件超长时跳过并记下来', async () => {
    const index = new WorkspaceVariableIndex(
      memorySource({ 'file:///w/big.css': `:root { --a: red }${' '.repeat(200)}` }),
      { lookupGlobs: GLOBS, maxIndexedFiles: 100, maxFileLength: 50 },
    );
    await index.build();
    expect(index.stats.files).toBe(0);
    expect(index.stats.skipped).toEqual(['file:///w/big.css']);
  });

  it('语法错误的文件被记为失败但不影响其他文件', async () => {
    const index = new WorkspaceVariableIndex(
      memorySource({
        'file:///w/bad.css': '.a { color: }}}{',
        'file:///w/good.css': ':root { --a: red }',
      }),
      OPTIONS,
    );
    await index.build();
    expect(index.stats.failed).toEqual(['file:///w/bad.css']);
    expect(lookupVariable('--a', { fromUri: 'file:///w/x.css', atOffset: 0 }, index.symbols())).toMatchObject({
      kind: 'resolved',
    });
  });
});

describe('增量更新', () => {
  it('同一 uri 覆盖而不是追加, 脏文档不会与磁盘版本并存', async () => {
    const source = memorySource({ 'file:///w/a.css': ':root { --a: red }' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();

    index.upsert('file:///w/a.css', 'css', ':root { --a: blue }');

    expect(index.stats.files).toBe(1);
    // 若两份定义并存, 这里会因为"多个 root 定义"变成 ambiguous。
    expect(lookupVariable('--a', { fromUri: 'file:///w/a.css', atOffset: 0 }, index.symbols())).toMatchObject({
      kind: 'resolved',
      rawValue: 'blue',
    });
  });

  it('删除文件后其定义随之消失', async () => {
    const source = memorySource({ 'file:///w/a.css': ':root { --a: red }' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    index.remove('file:///w/a.css');
    expect(lookupVariable('--a', { fromUri: 'file:///w/x.css', atOffset: 0 }, index.symbols())).toEqual({
      kind: 'unresolved',
      reason: 'no-definition',
    });
  });

  it('watcher 事件驱动增量更新并通知订阅者', async () => {
    const source = memorySource({ 'file:///w/a.css': ':root { --a: red }' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    let notified = 0;
    index.onDidChange(() => {
      notified += 1;
    });
    const stop = index.startWatching();

    source.files.set('file:///w/b.css', ':root { --b: blue }');
    source.emit({ uri: 'file:///w/b.css', kind: 'upsert' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(index.stats.files).toBe(2);
    expect(notified).toBeGreaterThan(0);

    source.emit({ uri: 'file:///w/b.css', kind: 'delete' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(index.stats.files).toBe(1);

    stop();
  });

  it('版本号随内容变化而递增, 供索引失效使用', async () => {
    const source = memorySource({ 'file:///w/a.css': ':root { --a: red }' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    const first = index.symbols().version;
    index.upsert('file:///w/a.css', 'css', ':root { --a: blue }');
    expect(index.symbols().version).toBeGreaterThan(first);
  });

  it('dispose 后不再持有定义', async () => {
    const source = memorySource({ 'file:///w/a.css': ':root { --a: red }' });
    const index = new WorkspaceVariableIndex(source, OPTIONS);
    await index.build();
    index.dispose();
    expect(index.stats.files).toBe(0);
  });
});
