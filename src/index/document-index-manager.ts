/**
 * 每个文档唯一索引实例的管理者。
 *
 * - key 为 `document.uri.toString()`;
 * - 非可见文档最多缓存 20 个, 使用 LRU 释放;
 * - 文档关闭、配置失效与 dispose 时释放索引、监听器和装饰。
 */
import * as vscode from 'vscode';

import { lookupVariable, toVariableValue } from '../adapters/variable-resolver.js';
import type { VariableSymbols } from '../adapters/types.js';
import { isVariableLanguage, isCssLikeLanguage, type ScanOptions } from '../core/scanner.js';
import { parseColorText } from '../core/parser.js';
import type { ResolvedColor, ResolveVariable } from '../core/types.js';
import { hiddenReason } from '../configuration/disable-gate.js';
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

export interface VariableAccess {
  /** 变量取值回调; 缺省表示该文档不解析变量。 */
  readonly resolveVariable?: ResolveVariable;
  /** `@color-profile` 名称 → fallback 颜色。 */
  readonly colorProfileFallbacks?: ReadonlyMap<string, ResolvedColor>;
}

export function scanOptionsFor(
  config: RuntimeConfiguration,
  languageId: string,
  variables: VariableAccess = {},
): ScanOptions {
  return {
    cssColor6: config.cssColor6,
    cssColorHdr: config.cssColorHdr,
    contextualPreview: config.contextualPreview,
    hdrAssumedHeadroom: config.hdrAssumedHeadroom,
    // `@color-profile` 的 fallback 由变量索引顺带产出, 接上即可让自定义色彩空间可预览。
    colorProfileFallbacks: variables.colorProfileFallbacks,
    matchWords: config.matchWords,
    cssLikeLanguage: isCssLikeLanguage(languageId),
    scanComments: config.scanComments,
    scanStrings: config.scanStrings,
    maxMatches: config.maxMatchesPerDocument,
    variableSyntax: config.variablesResolve && isVariableLanguage(languageId),
    resolveVariable: config.variablesResolve ? variables.resolveVariable : undefined,
    maxResolveDepth: config.maxResolveDepth,
  };
}

export class DocumentIndexManager implements vscode.Disposable {
  private readonly indexes = new Map<string, DocumentColorIndex>();
  /** LRU: 最近使用的 key 排在末尾。 */
  private readonly usage: string[] = [];
  private readonly coalescer = new ChangeCoalescer();
  private readonly emitter = new vscode.EventEmitter<IndexUpdate>();
  private variableContextVersion = 0;
  /** `@color-profile` fallback 的解析缓存, 按符号表版本失效。 */
  private profileCache: { readonly version: number; readonly map: ReadonlyMap<string, ResolvedColor> } | undefined;

  readonly onDidUpdate = this.emitter.event;

  /**
   * `getSymbols` 返回工作区变量符号表; 查询是同步的, 因此扫描一次即得最终结果。
   * 索引尚未就绪时返回空表即可 —— 就绪后由 `bumpVariableContext()` 触发重扫。
   */
  constructor(
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
    private readonly getSymbols: () => VariableSymbols,
  ) {}

  /** 变量符号表变化 (例如令牌文件被修改) 时提升版本以整体失效。 */
  bumpVariableContext(): void {
    this.variableContextVersion += 1;
    this.profileCache = undefined;
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
    const snapshot = index.ensure(
      document.getText(),
      {
        documentVersion: document.version,
        configDigest: configurationDigest(config),
        variableContextVersion: this.variableContextVersion,
      },
      scanOptionsFor(config, document.languageId, this.variableAccessFor(document)),
    );

    if (snapshot.truncated) {
      this.logger.warnOnce(
        `truncated:${document.uri.toString()}`,
        `document has more than ${config.maxMatchesPerDocument} colors; highlighting truncated`,
      );
    }
    return snapshot;
  }

  /**
   * 该文档的变量取值入口。
   *
   * 回调闭住 `fromUri`: 预处理器变量是顺序求值的, 查表需要知道"从哪个文件的哪个位置问"。
   */
  private variableAccessFor(document: vscode.TextDocument): VariableAccess {
    const fromUri = document.uri.toString();
    return {
      resolveVariable: (name, atOffset) =>
        toVariableValue(lookupVariable(name, { fromUri, atOffset }, this.getSymbols())),
      colorProfileFallbacks: this.colorProfileFallbacks(document),
    };
  }

  /** `@color-profile` 的 fallback 文本解析成颜色; 按符号表版本缓存, 避免每次扫描重复解析。 */
  private colorProfileFallbacks(document: vscode.TextDocument): ReadonlyMap<string, ResolvedColor> {
    const symbols = this.getSymbols();
    if (this.profileCache?.version === symbols.version) return this.profileCache.map;

    const map = new Map<string, ResolvedColor>();
    if (symbols.colorProfileFallbacks.size > 0) {
      const parseOptions = scanOptionsFor(this.getConfig(document), document.languageId);
      for (const [name, rawValue] of symbols.colorProfileFallbacks) {
        const parsed = parseColorText(rawValue, parseOptions);
        if (parsed?.resolved) map.set(name, parsed.resolved);
      }
    }
    this.profileCache = { version: symbols.version, map };
    return map;
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
