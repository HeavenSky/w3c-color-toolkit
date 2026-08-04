/**
 * CSS 自定义属性适配。
 *
 * 规则:
 * - 只有唯一的 `:root` / `:host` 定义可解析;
 * - 同名的局部选择器定义因为缺少 DOM 元素上下文而标记 contextual, 不猜测 cascade 胜者;
 * - `var()` fallback 可递归解析, 检测循环, 深度上限来自配置。
 */
import type {
  CollectOptions,
  TextDocumentLike,
  VariableContext,
  VariableDefinition,
  VariableIssue,
  VariableResolution,
} from './types.js';

/** `--name: value;` 声明。value 允许含嵌套括号。 */
const DECLARATION = /(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g;
/** 选择器块的起始, 用于判断声明所在的选择器。 */
const SELECTOR_BLOCK = /([^{}]+)\{/g;

const ROOT_SELECTORS = new Set([':root', ':host', 'html', ':where(:root)']);

function isRootSelector(selector: string): boolean {
  return selector
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .some((part) => ROOT_SELECTORS.has(part));
}

interface SelectorRange {
  readonly selector: string;
  readonly start: number;
  readonly end: number;
}

/** 粗粒度地把文本切成选择器块。嵌套时取最内层的选择器。 */
function selectorRanges(text: string): SelectorRange[] {
  const ranges: SelectorRange[] = [];
  const stack: { selector: string; start: number }[] = [];
  SELECTOR_BLOCK.lastIndex = 0;

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '{') {
      // 回溯找出这个 `{` 之前的选择器文本。
      let begin = index - 1;
      while (begin >= 0 && text[begin] !== '}' && text[begin] !== '{' && text[begin] !== ';') begin -= 1;
      const selector = text.slice(begin + 1, index).trim();
      stack.push({ selector, start: index + 1 });
    } else if (char === '}') {
      const open = stack.pop();
      if (open) ranges.push({ selector: open.selector, start: open.start, end: index });
    }
    index += 1;
  }
  for (const open of stack) ranges.push({ selector: open.selector, start: open.start, end: text.length });
  return ranges;
}

function selectorAt(ranges: readonly SelectorRange[], offset: number): string | undefined {
  let best: SelectorRange | undefined;
  for (const range of ranges) {
    if (offset < range.start || offset > range.end) continue;
    if (!best || range.start > best.start) best = range;
  }
  return best?.selector;
}

/** 收集单个文档中的自定义属性定义。 */
export function collectCssCustomProperties(
  document: TextDocumentLike,
  definitions: Map<string, VariableDefinition[]>,
): void {
  const text = document.getText();
  const ranges = selectorRanges(text);
  DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECLARATION.exec(text)) !== null) {
    const name = match[1];
    const rawValue = match[2].trim();
    const offset = match.index;
    const selector = selectorAt(ranges, offset);
    const list = definitions.get(name) ?? [];
    list.push({
      name,
      kind: 'css-custom-property',
      rawValue,
      sourceUri: document.uri,
      offset,
      selector,
    });
    definitions.set(name, list);
  }
}

/**
 * 解析 `var(--name)`。
 * 只有存在唯一的 root 级定义时才返回 `resolved`。
 */
export function resolveCssCustomProperty(
  name: string,
  context: VariableContext,
): VariableResolution {
  const definitions = context.definitions.get(name);
  if (!definitions || definitions.length === 0) return { kind: 'contextual', reason: 'no-definition' };

  const rootDefinitions = definitions.filter(
    (definition) => definition.selector !== undefined && isRootSelector(definition.selector),
  );

  // 唯一 root 定义可解析。
  if (rootDefinitions.length === 1) return { kind: 'resolved', rawValue: rootDefinitions[0].rawValue };
  if (rootDefinitions.length > 1) return { kind: 'contextual', reason: 'multiple-definitions' };

  // 没有 root 定义, 只有局部定义: 缺少元素上下文, 不猜测 cascade 胜者。
  return { kind: 'contextual', reason: 'multiple-definitions' };
}

/** 展开 `var(--a, fallback)` 链; 返回最终可解析的原始文本。 */
export function expandVarChain(
  rawValue: string,
  context: VariableContext,
  maxDepth: number,
  seen: ReadonlySet<string> = new Set(),
  issues: VariableIssue[] = [],
): { readonly text: string; readonly issues: readonly VariableIssue[] } {
  if (maxDepth <= 0) {
    issues.push({ kind: 'max-depth', detail: rawValue });
    return { text: rawValue, issues };
  }

  const varCall = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/;
  const match = varCall.exec(rawValue);
  if (!match) return { text: rawValue, issues };

  const name = match[1];
  const fallback = match[2]?.trim();

  if (seen.has(name)) {
    issues.push({ kind: 'circular', detail: name });
    return { text: rawValue, issues };
  }

  const resolution = resolveCssCustomProperty(name, context);
  const replacement =
    resolution.kind === 'resolved' ? resolution.rawValue : fallback !== undefined ? fallback : undefined;
  if (replacement === undefined) return { text: rawValue, issues };

  const nextSeen = new Set(seen);
  nextSeen.add(name);
  const substituted = rawValue.replace(match[0], replacement);
  return expandVarChain(substituted, context, maxDepth - 1, nextSeen, issues);
}

export function collectOptionsAllowImports(options: CollectOptions): boolean {
  return options.resolveVariables && options.maxImportDepth > 0 && options.maxImportFiles > 0;
}
