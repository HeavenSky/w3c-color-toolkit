/**
 * 工作区级变量符号索引。
 *
 * 存在的意义是让"变量解析"变成**同步查表**: 建索引是异步的 (要读文件), 但建好之后
 * 颜色层每次扫描只做内存查询。改造前的实现把跨文件读取放在扫描之后的异步补丁里,
 * 结果那条补丁路径不可达 (见方案「当前事实」), 跨文件解析从未真正生效。
 *
 * 发现范围以 glob 为主, `@import` / `@use` / `@forward` 作补充 (方案 D6):
 * 现实项目里样式文件常常只经 JS/TS 的 `import` 合并, 没有任何 CSS 层面的 `@import`,
 * 只跟导入图会永远看不到它们。
 *
 * 每个 uri 在索引里只有一条记录, 因此"同一个文件既在磁盘扫描里又是打开的脏文档"
 * 不会产生两份定义 —— 否则每个变量都会因为"多个定义"而变成歧义。
 *
 * 本文件不引用 vscode: glob 发现与文件监听经注入的 `StyleFileSource` 完成,
 * 单测注入内存替身。日志也不在这里打 —— 只暴露 `stats`, 由 `activate.ts` 上报一次。
 */
import { collectStylesheet, type CollectedStylesheet } from './variable-definitions.js';
import { emptySymbols } from './variable-resolver.js';
import type { StyleFileEvent, StyleFileSource, VariableDefinition, VariableSymbols } from './types.js';

/** 索引文件的扩展名 → languageId。Stylus 不解析变量 (方案 D3), 因此不在表内。 */
const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.sass', 'sass'],
  ['.less', 'less'],
]);

/** 单文件长度上限 (UTF-16 码元); 超过即跳过, 避免一个巨型产物拖垮索引。 */
export const DEFAULT_MAX_FILE_LENGTH = 512 * 1024;

/** `@import` 补充路径的展开轮数上限; 每轮把上一轮新发现文件的导入再解析一次。 */
const MAX_IMPORT_ROUNDS = 8;

export interface VariableIndexOptions {
  readonly lookupGlobs: readonly string[];
  readonly maxIndexedFiles: number;
  readonly maxFileLength?: number;
}

export interface VariableIndexStats {
  /** 实际进入索引的文件数。 */
  readonly files: number;
  /** 收集到的定义总数。 */
  readonly definitions: number;
  /** 解析失败被跳过的文件 uri。 */
  readonly failed: readonly string[];
  /** 因超长被跳过的文件 uri。 */
  readonly skipped: readonly string[];
  /** 命中 `maxIndexedFiles` 上限而未能全部索引。 */
  readonly truncated: boolean;
}

/** uri 的扩展名对应的 languageId; 不是可索引的样式文件时返回 undefined。 */
export function languageIdForUri(uri: string): string | undefined {
  const lower = uri.toLowerCase();
  for (const [extension, languageId] of LANGUAGE_BY_EXTENSION) {
    if (lower.endsWith(extension)) return languageId;
  }
  return undefined;
}

export class WorkspaceVariableIndex {
  /** 每个 uri 一条记录, 保证同一文件不贡献两份定义。 */
  private readonly files = new Map<string, CollectedStylesheet>();
  private readonly listeners = new Set<() => void>();
  private symbolsCache: VariableSymbols | undefined;
  private version = 0;
  private truncated = false;
  private readonly failed = new Set<string>();
  private readonly skipped = new Set<string>();
  private unwatch: (() => void) | undefined;

  constructor(
    private readonly source: StyleFileSource,
    private readonly options: VariableIndexOptions,
  ) {}

  /** 同步查询入口; 索引尚未就绪时返回空表。 */
  symbols(): VariableSymbols {
    if (!this.symbolsCache) this.symbolsCache = this.buildSymbols();
    return this.symbolsCache;
  }

  get stats(): VariableIndexStats {
    let definitions = 0;
    for (const collected of this.files.values()) definitions += collected.definitions.length;
    return {
      files: this.files.size,
      definitions,
      failed: [...this.failed],
      skipped: [...this.skipped],
      truncated: this.truncated,
    };
  }

  /** 索引内容变化时通知 (供调用方 bump 版本并重扫可见文档)。 */
  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 全量建索引: glob 发现 → 逐文件收集 → 按导入补充。 */
  async build(): Promise<void> {
    this.files.clear();
    this.failed.clear();
    this.skipped.clear();
    this.truncated = false;

    const listed = await this.source.list(this.options.lookupGlobs, this.options.maxIndexedFiles);
    this.truncated = listed.truncated;
    for (const uri of listed.uris) await this.indexFile(uri);
    await this.followImports();

    this.invalidateSymbols();
  }

  /** 开始监听范围内的文件变化; 返回取消函数。 */
  startWatching(): () => void {
    this.unwatch?.();
    const unwatch = this.source.watch(this.options.lookupGlobs, (event) => {
      void this.applyEvent(event);
    });
    this.unwatch = unwatch;
    return () => {
      unwatch();
      if (this.unwatch === unwatch) this.unwatch = undefined;
    };
  }

  /**
   * 用给定文本更新某个文件 (供打开的脏文档使用)。
   *
   * 同一 uri 覆盖而不是追加, 因此编辑中的文件不会与它的磁盘版本同时出现在索引里。
   */
  upsert(uri: string, languageId: string, text: string): void {
    if (text.length > this.maxFileLength) {
      this.skipped.add(uri);
      if (this.files.delete(uri)) this.invalidateSymbols();
      return;
    }
    this.skipped.delete(uri);
    const collected = collectStylesheet({ uri, languageId, getText: () => text });
    if (collected.failed) this.failed.add(uri);
    else this.failed.delete(uri);
    this.files.set(uri, collected);
    this.invalidateSymbols();
  }

  remove(uri: string): void {
    this.failed.delete(uri);
    this.skipped.delete(uri);
    if (this.files.delete(uri)) this.invalidateSymbols();
  }

  dispose(): void {
    this.unwatch?.();
    this.unwatch = undefined;
    this.listeners.clear();
    this.files.clear();
    this.invalidateSymbols();
  }

  private get maxFileLength(): number {
    return this.options.maxFileLength ?? DEFAULT_MAX_FILE_LENGTH;
  }

  private async applyEvent(event: StyleFileEvent): Promise<void> {
    if (event.kind === 'delete') {
      this.remove(event.uri);
      return;
    }
    await this.indexFile(event.uri);
    await this.followImports();
    this.invalidateSymbols();
  }

  /** 读取并索引单个文件; 已达上限或不是可索引类型时跳过。 */
  private async indexFile(uri: string): Promise<void> {
    const languageId = languageIdForUri(uri);
    if (!languageId) return;
    if (!this.files.has(uri) && this.files.size >= this.options.maxIndexedFiles) {
      this.truncated = true;
      return;
    }
    const text = await this.source.read(uri);
    if (text === undefined) {
      this.remove(uri);
      return;
    }
    if (text.length > this.maxFileLength) {
      this.skipped.add(uri);
      this.files.delete(uri);
      return;
    }
    this.skipped.delete(uri);
    const collected = collectStylesheet({ uri, languageId, getText: () => text });
    if (collected.failed) this.failed.add(uri);
    else this.failed.delete(uri);
    this.files.set(uri, collected);
  }

  /**
   * 把 `@import` 指向但未被 glob 命中的文件拉进索引。
   *
   * 逐轮展开而不是递归: 每轮只处理"上一轮新加入的文件"的导入, 轮数有上限,
   * 因此循环导入自然终止 (已在索引里的 uri 不会再次进入待处理集合)。
   */
  private async followImports(): Promise<void> {
    let pending = [...this.files.keys()];
    for (let round = 0; round < MAX_IMPORT_ROUNDS && pending.length > 0; round += 1) {
      const next: string[] = [];
      for (const fromUri of pending) {
        const collected = this.files.get(fromUri);
        if (!collected) continue;
        for (const specifier of collected.imports) {
          for (const candidate of this.source.resolveImport(fromUri, specifier)) {
            if (this.files.has(candidate)) continue;
            if (this.files.size >= this.options.maxIndexedFiles) {
              this.truncated = true;
              return;
            }
            await this.indexFile(candidate);
            if (this.files.has(candidate)) next.push(candidate);
          }
        }
      }
      pending = next;
    }
  }

  private invalidateSymbols(): void {
    this.symbolsCache = undefined;
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private buildSymbols(): VariableSymbols {
    if (this.files.size === 0) return emptySymbols(this.version);

    const definitions = new Map<string, VariableDefinition[]>();
    const colorProfileFallbacks = new Map<string, string>();
    // 按 uri 排序, 使候选顺序在多次建索引之间稳定 (Hover 列出的候选顺序不该抖动)。
    for (const uri of [...this.files.keys()].sort()) {
      const collected = this.files.get(uri);
      if (!collected) continue;
      for (const definition of collected.definitions) {
        const list = definitions.get(definition.name) ?? [];
        list.push(definition);
        definitions.set(definition.name, list);
      }
      for (const fallback of collected.colorProfileFallbacks) {
        colorProfileFallbacks.set(fallback.name, fallback.rawValue);
      }
    }
    return { definitions, colorProfileFallbacks, version: this.version };
  }
}
