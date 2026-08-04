/**
 * 变量适配的统一契约。
 *
 * 本层不引用 vscode API: 文件读取通过注入的 `FileReader` 完成,
 * Node 与 Web 入口分别注入 `imports-node.ts` 与 `imports-web.ts` 的实现。
 */
import type { ResolvedColor } from '../core/types.js';

/** 与 `vscode.TextDocument` 结构兼容的最小接口。 */
export interface TextDocumentLike {
  readonly uri: string;
  readonly languageId: string;
  getText(): string;
}

export type VariableKind = 'css-custom-property' | 'scss' | 'less' | 'stylus';

export interface VariableDefinition {
  readonly name: string;
  readonly kind: VariableKind;
  readonly rawValue: string;
  /** 定义所在文档的 uri。 */
  readonly sourceUri: string;
  /** 定义在文档中的 offset, 用于"位置之前的定义"判断。 */
  readonly offset: number;
  /** CSS 自定义属性所在选择器; `:root`/`:host` 之外的定义视为局部。 */
  readonly selector?: string;
}

export interface VariableContext {
  /** 变量名 → 全部定义。多定义即为 contextual。 */
  readonly definitions: ReadonlyMap<string, readonly VariableDefinition[]>;
  /** `@color-profile` 名称 → fallback 颜色。 */
  readonly colorProfileFallbacks: ReadonlyMap<string, ResolvedColor>;
  /** 递增版本, 供索引失效判断。 */
  readonly version: number;
  /** 收集过程中的问题, 供 diagnostic 使用。 */
  readonly issues: readonly VariableIssue[];
}

export type VariableIssueKind =
  | 'circular'
  | 'max-depth'
  | 'import-not-allowed'
  | 'multiple-definitions'
  | 'untrusted-workspace';

export interface VariableIssue {
  readonly kind: VariableIssueKind;
  readonly detail: string;
}

export type VariableResolution =
  | { readonly kind: 'resolved'; readonly rawValue: string }
  | { readonly kind: 'contextual'; readonly reason: VariableIssueKind | 'no-definition' }
  | { readonly kind: 'unknown' };

export interface FileReader {
  /** 读取工作区内文件; 不允许或失败时返回 undefined。 */
  read(uri: string): Promise<string | undefined>;
  /** 把 `@import`/`@use` 的目标解析为 uri 候选列表。 */
  resolveImport(fromUri: string, specifier: string, includePaths: readonly string[]): string[];
  /** 工作区是否受信任。 */
  isTrusted(): boolean;
}

export interface CollectOptions {
  readonly resolveVariables: boolean;
  readonly includePaths: readonly string[];
  readonly maxImportDepth: number;
  readonly maxImportFiles: number;
  readonly maxResolveDepth: number;
}

export interface VariableContextProvider {
  collect(document: TextDocumentLike, options: CollectOptions): Promise<VariableContext>;
  resolve(name: string, atOffset: number, context: VariableContext): VariableResolution;
}
