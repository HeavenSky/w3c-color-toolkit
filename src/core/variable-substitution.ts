/**
 * `var()` 代换: 把一段表达式里的变量引用换成它们的取值, 直到不再含 `var()`。
 *
 * 为什么必须做代换而不是"单独解析变量的值":
 * `rgb(var(--channels) / 0.4)` 里 `--channels` 的值可能是通道三元组 `148 163 184`,
 * 它单独不是颜色; 只有代换回原文本才成立。变量自身的值含 `var()` 时 (`--a: var(--b)`)
 * 也是同一个动作, 因此递归与循环检测只在这里写一遍。
 *
 * 定位靠 token 流而不是正则: 每一轮都真解析一次, 取 `var()` 节点的精确源码区间,
 * 从右往左替换 (从左往右会让后续区间偏移)。替换完成后交给真正的颜色解析器。
 *
 * 终止性: 每轮至少替换一个 `var()`; 轮数以 `maxRounds` 为上限。因此
 * `rgb(var(--x) var(--x))` (同一变量出现两次, 一轮内一起换掉) 不会被误判成循环,
 * 而 `--a: var(--b); --b: var(--a)` 这种真循环会耗尽轮数并判为不可代换。
 */
import {
  functionName,
  isFunctionNode,
  isTokenNode,
  nodeSourceIndices,
  parseComponentValues,
  type ComponentValue,
} from './csstools-bridge.js';
import type { ResolveVariable, VariableCandidateValue } from './types.js';

/** 默认代换轮数上限; 与 `advanced.variables.maxResolveDepth` 的默认值一致。 */
export const DEFAULT_MAX_SUBSTITUTION_ROUNDS = 20;

export interface SubstitutionResult {
  /** 代换完成的文本; 有任何引用取不到值时为 undefined。 */
  readonly text?: string;
  /** 出现过的变量名, 按首次出现顺序去重。 */
  readonly names: readonly string[];
  /**
   * 第一个"有定义但取值不唯一"的引用的候选集合。
   *
   * 它决定调用方给出 contextual 而不是静默移除: 候选是枚举出来的事实, 可以展示。
   */
  readonly ambiguous?: readonly VariableCandidateValue[];
  /** 产生歧义的那个变量名; 调用方据此把每个候选代换回原表达式做预览。 */
  readonly ambiguousName?: string;
}

interface VarReference {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  /** `var(--a, <fallback>)` 的 fallback 原文; 没有则为 undefined。 */
  readonly fallback?: string;
}

/** `var()` 的第一个实参必须是 <custom-property-name>。 */
function customPropertyOf(node: ComponentValue): string | undefined {
  for (const inner of node.value as ComponentValue[]) {
    const text = inner.toString().trim();
    if (text.startsWith('--')) return text;
  }
  return undefined;
}

/**
 * `var()` 的 fallback: 第一个逗号之后的全部内容。
 *
 * 用 token 文本切分而不是正则: 逗号是 comma-token, 因此嵌套括号里的逗号不会误伤。
 */
function fallbackOf(node: ComponentValue): string | undefined {
  const children = node.value as ComponentValue[];
  const commaIndex = children.findIndex((child) => child.toString() === ',');
  if (commaIndex < 0) return undefined;
  const fallback = children
    .slice(commaIndex + 1)
    .map((child) => child.toString())
    .join('')
    .trim();
  return fallback.length > 0 ? fallback : undefined;
}

/** 收集一段文本里所有顶层可见的 `var()` 引用 (含嵌套在函数实参里的)。 */
function collectReferences(text: string): VarReference[] {
  const out: VarReference[] = [];
  const visit = (nodes: readonly ComponentValue[]): void => {
    for (const node of nodes) {
      if (isFunctionNode(node) && functionName(node) === 'var') {
        const name = customPropertyOf(node);
        const indices = nodeSourceIndices(node);
        if (name && indices) {
          out.push({ name, start: indices[0], end: indices[1] + 1, fallback: fallbackOf(node) });
          // 不再深入这个 var(): 它整体会被替换掉, 内部的嵌套 var() 由下一轮处理。
          continue;
        }
      }
      // 必须先排除 token 节点: `TokenNode.value` 是 CSSToken 元组, 它也是数组,
      // 误当作子节点递归会取到 undefined 元素。
      if (isTokenNode(node)) continue;
      const children = (node as { value?: unknown }).value;
      if (Array.isArray(children)) visit(children as ComponentValue[]);
    }
  };
  visit(parseComponentValues(text));
  return out;
}

/**
 * 代换一段表达式里的全部 `var()`。
 *
 * 取值不到时的取舍: 有 fallback 就用 fallback (那正是 CSS 语义下真正生效的值);
 * 没有 fallback 时, 歧义与无定义都使代换失败, 但前者会把候选带回给调用方。
 */
export function substituteVariables(
  text: string,
  resolve: ResolveVariable,
  atOffset: number,
  maxRounds: number = DEFAULT_MAX_SUBSTITUTION_ROUNDS,
): SubstitutionResult {
  const names: string[] = [];
  let current = text;

  for (let round = 0; round < maxRounds; round += 1) {
    const references = collectReferences(current);
    if (references.length === 0) return { text: current, names };

    let ambiguous: readonly VariableCandidateValue[] | undefined;
    let ambiguousName: string | undefined;
    const replacements: { start: number; end: number; value: string }[] = [];
    for (const reference of references) {
      if (!names.includes(reference.name)) names.push(reference.name);
      const value = resolve(reference.name, atOffset);
      if (value.kind === 'resolved') {
        replacements.push({ start: reference.start, end: reference.end, value: value.rawValue });
        continue;
      }
      if (reference.fallback !== undefined) {
        replacements.push({ start: reference.start, end: reference.end, value: reference.fallback });
        continue;
      }
      if (value.kind === 'ambiguous' && !ambiguous) {
        ambiguous = value.candidates;
        ambiguousName = reference.name;
      }
    }
    if (replacements.length === 0) return { names, ambiguous, ambiguousName };

    // 从右往左替换, 否则前面的替换会让后面的区间失效。
    for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
      current = current.slice(0, replacement.start) + replacement.value + current.slice(replacement.end);
    }
  }

  // 轮数耗尽: 真循环引用, 或嵌套深到不合理。
  return { names };
}
