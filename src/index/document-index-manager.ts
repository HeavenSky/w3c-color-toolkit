/**
 * 每个文档唯一索引实例的管理者。
 *
 * - key 为 `document.uri.toString()`;
 * - 非可见文档最多缓存 20 个, 使用 LRU 释放;
 * - 文档关闭、配置失效与 dispose 时释放索引、监听器和装饰。
 */
import * as vscode from 'vscode';

import type { CollectOptions, FileReader, TextDocumentLike, VariableContext } from '../adapters/types.js';
import { collectLocalVariableContext, collectVariableContext } from '../adapters/variable-context.js';
import { isCssLikeLanguage, type ScanOptions } from '../core/scanner.js';
import { hiddenReason } from '../configuration/disable-gate.js';
import type { RuntimeConfiguration } from '../configuration/load.js';
import { configurationDigest } from '../configuration/load.js';
import type { Logger } from '../logging/output-channel.js';

import { ChangeCoalescer } from './change-coalescer.js';
import { DocumentColorIndex, type IndexSnapshot } from './document-color-index.js';
import { isVariableMatch, patchVariableMatches } from './variable-patch.js';

export const MAX_CACHED_HIDDEN_DOCUMENTS = 20;

/** 变量上下文缓存的文档数上限; 与隐藏文档索引上限同量级。 */
export const MAX_CACHED_VARIABLE_CONTEXTS = 50;

export interface IndexUpdate {
  readonly document: vscode.TextDocument;
  readonly snapshot: IndexSnapshot;
}

export function scanOptionsFor(
  config: RuntimeConfiguration,
  languageId: string,
  variableContext?: VariableContext,
): ScanOptions {
  return {
    cssColor6: config.cssColor6,
    cssColorHdr: config.cssColorHdr,
    contextualPreview: config.contextualPreview,
    hdrAssumedHeadroom: config.hdrAssumedHeadroom,
    // `@color-profile` 的 fallback 由变量收集顺带产出, 接上即可让自定义色彩空间可预览。
    colorProfileFallbacks: variableContext?.colorProfileFallbacks,
    matchWords: config.matchWords,
    cssLikeLanguage: isCssLikeLanguage(languageId),
    scanComments: config.scanComments,
    scanStrings: config.scanStrings,
    maxMatches: config.maxMatchesPerDocument,
  };
}

export class DocumentIndexManager implements vscode.Disposable {
  private readonly indexes = new Map<string, DocumentColorIndex>();
  /** LRU: 最近使用的 key 排在末尾。 */
  private readonly usage: string[] = [];
  private readonly coalescer = new ChangeCoalescer();
  private readonly emitter = new vscode.EventEmitter<IndexUpdate>();
  private variableContextVersion = 0;
  /** 含导入的完整变量上下文, 按 uri 缓存并携带文档版本。 */
  private readonly contextCache = new Map<
    string,
    { readonly version: number; readonly context: VariableContext }
  >();
  /** 进行中的收集; 防止同一文档并发发起多轮跨文件读取。 */
  private readonly pendingContexts = new Map<string, Promise<VariableContext>>();

  readonly onDidUpdate = this.emitter.event;

  constructor(
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
    private readonly fileReader: FileReader,
  ) {}

  /** 变量上下文变化 (例如导入的变量文件被修改) 时提升版本以整体失效。 */
  bumpVariableContext(): void {
    this.variableContextVersion += 1;
  }

  private touch(key: string): void {
    const existing = this.usage.indexOf(key);
    if (existing >= 0) this.usage.splice(existing, 1);
    this.usage.push(key);
    this.evictIfNeeded();
  }

  private visibleKeys(): Set<string> {
    const keys = new Set<string>();
    for (const editor of vscode.window.visibleTextEditors) {
      keys.add(editor.document.uri.toString());
    }
    return keys;
  }

  private evictIfNeeded(): void {
    const visible = this.visibleKeys();
    const hidden = this.usage.filter((key) => !visible.has(key));
    while (hidden.length > MAX_CACHED_HIDDEN_DOCUMENTS) {
      const key = hidden.shift();
      if (!key) break;
      this.release(key);
    }
  }

  private indexFor(document: vscode.TextDocument): DocumentColorIndex {
    const key = document.uri.toString();
    let index = this.indexes.get(key);
    if (!index) {
      index = new DocumentColorIndex();
      this.indexes.set(key, index);
    }
    this.touch(key);
    return index;
  }

  /** 同步获取索引; 已是最新时不重新扫描。 */
  ensure(document: vscode.TextDocument): IndexSnapshot | undefined {
    const config = this.getConfig(document);

    const hidden = hiddenReason(document, config);
    if (hidden) {
      const key = document.uri.toString();
      if (hidden !== 'disabled' && hidden !== 'output-scheme') {
        this.logger.warnOnce(`hidden:${hidden}:${key}`, `document is hidden (${hidden}): ${key}`);
      }
      // 丢掉索引实例: 留着只会是一份没人该读的旧快照。
      this.release(key);
      return undefined;
    }

    const index = this.indexFor(document);
    // 先用本文档的定义解析一遍 (同步); 跨文件的定义由异步补丁补上。
    const localContext = this.localContextFor(document, config);
    const snapshot = index.ensure(
      document.getText(),
      {
        documentVersion: document.version,
        configDigest: configurationDigest(config),
        variableContextVersion: this.variableContextVersion,
      },
      scanOptionsFor(config, document.languageId, localContext),
      localContext && { context: localContext, maxResolveDepth: config.maxResolveDepth },
    );

    if (snapshot.truncated) {
      this.logger.warnOnce(
        `truncated:${document.uri.toString()}`,
        `document has more than ${config.maxMatchesPerDocument} colors; highlighting truncated`,
      );
    }

    // 同步这一遍解决不了跨文件定义; 还有变量没解析出来时才去读导入。
    if (localContext && snapshot.matches.some((match) => isVariableMatch(match))) {
      this.schedulePatch(document, config);
    }
    return snapshot;
  }

  /**
   * 写入上下文缓存, 每个 uri 只保留一条 (新版本覆盖旧版本)。
   *
   * 先删后插使已存在的 uri 移到插入顺序末尾, 超出上限时淘汰的才是真正最旧的那一条。
   * 提供器没有文档关闭事件可挂, 只能靠上限兜住增长。
   */
  private rememberContext(uri: string, version: number, context: VariableContext): void {
    this.contextCache.delete(uri);
    this.contextCache.set(uri, { version, context });
    while (this.contextCache.size > MAX_CACHED_VARIABLE_CONTEXTS) {
      const oldest = this.contextCache.keys().next();
      if (oldest.done) break;
      this.contextCache.delete(oldest.value);
    }
  }

  /** `TextDocumentLike` 要求 uri 为字符串, 而 `vscode.TextDocument.uri` 是对象。 */
  private documentLike(document: vscode.TextDocument): TextDocumentLike {
    return {
      uri: document.uri.toString(),
      languageId: document.languageId,
      // `ensure()` 本来就取过一次全文, 这里不引入新的实体化开销。
      getText: () => document.getText(),
    };
  }

  private collectOptionsFor(config: RuntimeConfiguration): CollectOptions {
    return {
      resolveVariables: config.variablesResolve,
      includePaths: config.variablesIncludePaths,
      maxImportDepth: config.maxImportDepth,
      maxImportFiles: config.maxImportFiles,
      maxResolveDepth: config.maxResolveDepth,
    };
  }

  /** 本文档定义构成的同步上下文; 关闭变量解析或非 CSS 系语言时返回 undefined。 */
  private localContextFor(
    document: vscode.TextDocument,
    config: RuntimeConfiguration,
  ): VariableContext | undefined {
    if (!config.variablesResolve) return undefined;
    if (!isCssLikeLanguage(document.languageId)) return undefined;
    return collectLocalVariableContext(
      this.documentLike(document),
      scanOptionsFor(config, document.languageId),
    );
  }

  /**
   * 跨文件补丁: 收集含导入的完整上下文, 重新解析变量 match 后写回。
   *
   * 三条约束缺一不可:
   * - **在途去重**: `ensure()` 是同步且被渲染路径高频调用, 没有这层保护会对同一文档
   *   并发发起多次收集, 每次最坏读 `maxImportFiles` 个文件;
   * - **写回前重新校验**: `await` 期间索引可能已被隐身分支 `release()` 掉, 或文档已改版本。
   *   `accept()` 只挡得住"版本更旧", 挡不住"索引已被释放";
   * - **失败不放大**: 收集抛错时只记一条日志并放弃本次补丁, 保持同步快照 (变量静默)。
   */
  private schedulePatch(document: vscode.TextDocument, config: RuntimeConfiguration): void {
    const key = document.uri.toString();
    if (this.pendingContexts.has(key)) return;

    const version = document.version;
    const cached = this.contextCache.get(key);
    if (cached && cached.version === version) {
      this.applyPatch(document, config, cached.context, version);
      return;
    }

    const run = collectVariableContext(
      this.documentLike(document),
      this.collectOptionsFor(config),
      this.fileReader,
      scanOptionsFor(config, document.languageId),
    );
    this.pendingContexts.set(key, run);
    void run
      .then((context) => {
        this.rememberContext(key, version, context);
        this.applyPatch(document, config, context, version);
      })
      .catch((error: unknown) => {
        this.logger.warnOnce(
          `variable-context-failed:${key}`,
          `variable context collection failed: ${String(error)}`,
        );
      })
      .finally(() => {
        this.pendingContexts.delete(key);
      });
  }

  private applyPatch(
    document: vscode.TextDocument,
    config: RuntimeConfiguration,
    context: VariableContext,
    version: number,
  ): void {
    // 索引可能已被隐身分支释放, 或文档已经改了版本。
    const index = this.indexes.get(document.uri.toString());
    const snapshot = index?.current;
    if (!index || !snapshot || document.isClosed) return;
    if (snapshot.documentVersion !== version || document.version !== version) return;

    const matches = patchVariableMatches(snapshot.matches, context, {
      parseOptions: scanOptionsFor(config, document.languageId, context),
      maxResolveDepth: config.maxResolveDepth,
    });
    if (matches === snapshot.matches) return;

    if (index.accept({ ...snapshot, matches })) {
      this.emitter.fire({ document, snapshot: { ...snapshot, matches } });
    }
  }

  /** 合并窗口内的重复变更后刷新, 并广播更新。 */
  scheduleRefresh(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    this.coalescer.schedule(key, () => {
      // 文档可能在窗口内被关闭。
      if (document.isClosed) {
        this.release(key);
        return;
      }
      const snapshot = this.ensure(document);
      if (snapshot) this.emitter.fire({ document, snapshot });
    });
  }

  /** 立即刷新, 跳过合并窗口。 */
  refreshNow(document: vscode.TextDocument): IndexSnapshot | undefined {
    this.coalescer.cancel(document.uri.toString());
    const snapshot = this.ensure(document);
    if (snapshot) this.emitter.fire({ document, snapshot });
    return snapshot;
  }

  indexOf(document: vscode.TextDocument): DocumentColorIndex | undefined {
    return this.indexes.get(document.uri.toString());
  }

  /** 丢弃某个文档的索引。 */
  release(key: string): void {
    this.coalescer.cancel(key);
    this.indexes.delete(key);
    const index = this.usage.indexOf(key);
    if (index >= 0) this.usage.splice(index, 1);
  }

  releaseDocument(document: vscode.TextDocument): void {
    this.release(document.uri.toString());
  }

  /** 配置变化: 全部索引失效, 但保留实例以复用。 */
  invalidateAll(): void {
    for (const index of this.indexes.values()) index.invalidate();
    this.logger.resetOnce();
  }

  clear(): void {
    for (const key of [...this.indexes.keys()]) this.release(key);
  }

  get size(): number {
    return this.indexes.size;
  }

  dispose(): void {
    this.clear();
    this.coalescer.dispose();
    this.emitter.dispose();
  }
}
