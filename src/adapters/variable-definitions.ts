/**
 * 从样式表事实里筛出"变量定义", 并标注解析器判定歧义所需的三个属性。
 *
 * 本层只记录事实, 不判断哪个定义生效 —— 那是 `variable-resolver.ts` 的职责。
 * 也不解析颜色: `@color-profile` 的 fallback 以原始文本返回, 由拿得到 `ParseOptions`
 * 的调用方解析, 避免 adapters 反向依赖 core 的解析选项。
 */
import { ancestorChain, readStylesheet, type StyleAncestor, type StyleDeclaration } from './stylesheet-ast.js';
import type { TextDocumentLike, VariableDefinition, VariableKind } from './types.js';

/** root 级选择器; 只有它们上面的自定义属性可以在没有元素上下文时确定生效。 */
const ROOT_SELECTORS: ReadonlySet<string> = new Set([':root', ':host', 'html', ':where(:root)']);

/** 取值依赖运行环境的 at-rule; 内部定义无法静态断言生效。 */
const CONDITIONAL_AT_RULES: ReadonlySet<string> = new Set(['media', 'supports', 'container']);

export interface ColorProfileFallback {
  /** `@color-profile --name` 的 dashed-ident。 */
  readonly name: string;
  /** `fallback` 描述符的原始文本。 */
  readonly rawValue: string;
}

export interface CollectedStylesheet {
  readonly definitions: readonly VariableDefinition[];
  readonly colorProfileFallbacks: readonly ColorProfileFallback[];
  readonly imports: readonly string[];
  /** 该文件解析失败, 不贡献任何事实。 */
  readonly failed: boolean;
}

function kindOf(prop: string): VariableKind | undefined {
  if (prop.startsWith('--')) return 'css-custom-property';
  if (prop.startsWith('$')) return 'scss';
  // Less 的 `@brand`; `@media` 这类 at-rule 不会走到这里 (AST 层只把 variable at-rule 转成声明)。
  if (prop.startsWith('@')) return 'less';
  return undefined;
}

function isRootSelector(selector: string): boolean {
  return selector
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .some((part) => ROOT_SELECTORS.has(part));
}

function innermostSelector(ancestors: readonly StyleAncestor[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.kind === 'rule') return ancestor.selector;
  }
  return undefined;
}

function hasConditionalAtRule(ancestors: readonly StyleAncestor[]): boolean {
  return ancestors.some(
    (ancestor) => ancestor.kind === 'at-rule' && CONDITIONAL_AT_RULES.has(ancestor.name.toLowerCase()),
  );
}

function colorProfileName(ancestors: readonly StyleAncestor[]): string | undefined {
  const last = ancestors[ancestors.length - 1];
  if (!last || last.kind !== 'at-rule') return undefined;
  if (last.name.toLowerCase() !== 'color-profile') return undefined;
  const name = last.params.trim();
  return name.startsWith('--') ? name : undefined;
}

function definitionOf(
  declaration: StyleDeclaration,
  kind: VariableKind,
  sourceUri: string,
): VariableDefinition {
  const selector = innermostSelector(declaration.ancestors);
  const conditional = hasConditionalAtRule(declaration.ancestors);
  return {
    name: declaration.prop,
    kind,
    rawValue: declaration.value,
    sourceUri,
    offset: declaration.offset,
    selector,
    ancestorChain: ancestorChain(declaration.ancestors),
    conditional,
    // 自定义属性只有落在 root 级选择器上才可能无条件生效; 预处理器变量不看选择器,
    // 顶层声明即无条件, 因此这里用同一个字段表达"无条件生效"这件事。
    isRoot:
      kind === 'css-custom-property'
        ? selector !== undefined && isRootSelector(selector) && !conditional
        : declaration.ancestors.length === 0 && !conditional,
  };
}

/** 收集一份文档的变量定义、`@color-profile` fallback 与导入。 */
export function collectStylesheet(document: TextDocumentLike): CollectedStylesheet {
  const facts = readStylesheet(document);
  if (facts.failed) {
    return { definitions: [], colorProfileFallbacks: [], imports: [], failed: true };
  }

  const definitions: VariableDefinition[] = [];
  const colorProfileFallbacks: ColorProfileFallback[] = [];

  for (const declaration of facts.declarations) {
    const profile = colorProfileName(declaration.ancestors);
    if (profile !== undefined) {
      if (declaration.prop.toLowerCase() === 'fallback') {
        colorProfileFallbacks.push({ name: profile, rawValue: declaration.value });
      }
      // `@color-profile` 里的其他描述符 (src 等) 不是变量定义。
      continue;
    }

    const kind = kindOf(declaration.prop);
    if (!kind) continue;
    if (declaration.value.length === 0) continue;
    definitions.push(definitionOf(declaration, kind, document.uri));
  }

  return { definitions, colorProfileFallbacks, imports: facts.imports, failed: false };
}
