/**
 * 每个文档唯一索引实例的管理者。
 *
 * - key 为 `document.uri.toString()`;
 * - 非可见文档最多缓存 20 个, 使用 LRU 释放;
 * - 文档关闭、配置失效与 dispose 时释放索引、监听器和装饰。
 */
import * as vscode from 'vscode';

import { isCssLikeLanguage, type ScanOptions } from '../core/scanner.js';
import type { RuntimeConfiguration } from '../configuration/load.js';
import { configurationDigest } from '../configuration/load.js';
import type { Logger } from '../logging/output-channel.js';

import { ChangeCoalescer } from './change-coalescer.js';
import { DocumentColorIndex, type IndexSnapshot } from './document-color-index.js';

export const MAX_CACHED_HIDDEN_DOCUMENTS = 20;

export interface IndexUpdate {
  readonly document: vscode.TextDocument;
  readonly snapshot: IndexSnapshot;
}

export function scanOptionsFor(
  config: RuntimeConfiguration,
  languageId: string,
): ScanOptions {
  return {
    cssColor6: config.cssColor6,
    cssColorHdr: config.cssColorHdr,
    contextualPreview: config.contextualPreview,
    hdrAssumedHeadroom: config.hdrAssumedHeadroom,
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

  readonly onDidUpdate = this.emitter.event;

  constructor(
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
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
    if (!config.enabled) return undefined;

    const sizeKb = Buffer.byteLength(document.getText(), 'utf8') / 1024;
    if (sizeKb > config.maxDocumentSizeKb) {
      this.logger.warnOnce(
        `too-large:${document.uri.toString()}`,
        `document exceeds ${config.maxDocumentSizeKb} KB and is not scanned: ${document.uri.toString()}`,
      );
      return undefined;
    }

    const index = this.indexFor(document);
    const snapshot = index.ensure(
      document.getText(),
      {
        documentVersion: document.version,
        configDigest: configurationDigest(config),
        variableContextVersion: this.variableContextVersion,
      },
      scanOptionsFor(config, document.languageId),
    );

    if (snapshot.truncated) {
      this.logger.warnOnce(
        `truncated:${document.uri.toString()}`,
        `document has more than ${config.maxMatchesPerDocument} colors; highlighting truncated`,
      );
    }
    return snapshot;
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
