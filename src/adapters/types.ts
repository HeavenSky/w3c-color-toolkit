/**
 * 变量适配的统一契约。
 *
 * 本层不引用 vscode API: 文件读取通过注入的 `FileReader` 完成,
 * 运行时由 `extension.ts` 注入 `workspace-file-reader.ts` 的实现, 测试可替换成内存实现。
 */
/** 与 `vscode.TextDocument` 结构兼容的最小接口。 */
export interface TextDocumentLike {
  readonly uri: string;
  readonly languageId: string;
  getText(): string;
}

/** Stylus 不解析变量, 因此不在其中。 */
export type VariableKind = 'css-custom-property' | 'scss' | 'less';

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
  /**
   * 由外到内的祖先链, 例如 `['@layer base', ':root']`。
   *
   * 供歧义候选展示"这个值来自哪里"。
   */
  readonly ancestorChain?: readonly string[];
  /** 定义处于 `@media` / `@supports` / `@container` 内, 取值依赖运行环境。 */
  readonly conditional?: boolean;
  /**
   * 该定义是否**无条件生效**: 自定义属性要求落在 root 级选择器上,
   * 预处理器变量要求是顶层声明; 两者都要求不在条件 at-rule 内。
   */
  readonly isRoot?: boolean;
}

/** 歧义候选: 一个变量在缺少元素上下文时可能取到的某个值, 以及它来自哪里。 */
export interface VariableCandidate {
  readonly rawValue: string;
  /** 来源描述, 例如 `:root`、`[data-product="hui"]`、`@media (…) › :root`。 */
  readonly origin: string;
  readonly sourceUri: string;
}

/**
 * 变量查表结果 (三态)。
 *
 * 中间那一态是关键: "有定义但取值取决于元素或环境"与"根本没有定义"必须分开 ——
 * 前者要把候选带出来供 Hover 列出, 后者才是静默移除。改造前只有二态, 因此多主题令牌
 * 与拼错的变量名得到同一个结果 (什么都不显示)。
 */
export type VariableLookup =
  | { readonly kind: 'resolved'; readonly rawValue: string; readonly sourceUri: string }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly VariableCandidate[] }
  | { readonly kind: 'unresolved'; readonly reason: 'no-definition' };

/** 工作区符号表: 变量名 → 全部定义。查询是同步的。 */
export interface VariableSymbols {
  readonly definitions: ReadonlyMap<string, readonly VariableDefinition[]>;
  /** `@color-profile` 名称 → `fallback` 描述符的原始文本 (颜色解析由调用方完成)。 */
  readonly colorProfileFallbacks: ReadonlyMap<string, string>;
  /** 递增版本, 供索引失效判断。 */
  readonly version: number;
}

/** 查表位置: 预处理器变量是顺序求值的, 因此需要知道从哪个文件的哪个位置发起查询。 */
export interface LookupSite {
  readonly fromUri: string;
  readonly atOffset: number;
}

/** 索引到的样式文件发生变化。 */
export interface StyleFileEvent {
  readonly uri: string;
  /** `upsert` 覆盖创建与修改; `delete` 含文件被删或移出范围。 */
  readonly kind: 'upsert' | 'delete';
}

/**
 * 工作区样式文件的来源。
 *
 * 与 `FileReader` 分开的原因: 变量索引需要的是"按 glob 发现 + 监听变化", 而 `FileReader`
 * 只负责"按 `@import` 解析路径并读取"。运行时实现在 `workspace-file-reader.ts` (引用 vscode),
 * 单测注入内存替身。
 */
export interface StyleFileSource {
  /** 按 glob 列出工作区内的样式文件; 命中数超过 `maxFiles` 时截断并置 `truncated`。 */
  list(globs: readonly string[], maxFiles: number): Promise<{
    readonly uris: readonly string[];
    readonly truncated: boolean;
  }>;
  /** 读取内容; 已打开的脏文档优先返回编辑器里的内容而不是磁盘内容。 */
  read(uri: string): Promise<string | undefined>;
  /** 把 `@import` / `@use` 的 specifier 解析成候选 uri。 */
  resolveImport(fromUri: string, specifier: string): readonly string[];
  /** 监听范围内文件的变化; 返回取消函数。 */
  watch(globs: readonly string[], listener: (event: StyleFileEvent) => void): () => void;
}

export interface FileReader {
  /** 读取工作区内文件; 不允许或失败时返回 undefined。 */
  read(uri: string): Promise<string | undefined>;
  /** 把 `@import`/`@use` 的目标解析为 uri 候选列表。 */
  resolveImport(fromUri: string, specifier: string, includePaths: readonly string[]): string[];
  /** 工作区是否受信任。 */
  isTrusted(): boolean;
}
