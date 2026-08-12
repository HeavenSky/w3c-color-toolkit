/**
 * 变量查表: 符号表 + 一个位置 → 三态结果。纯函数, 不读文件, 不认识颜色。
 *
 * 判定规则只有一条主线: **在没有元素上下文的前提下, 这个变量的取值是否唯一确定?**
 * - 确定 → `resolved`;
 * - 不确定但候选可枚举 → `ambiguous` 并把候选带出去 (方案 D5);
 * - 连定义都没有 → `unresolved`。
 *
 * 自定义属性与预处理器变量的"确定"含义不同:
 * - 自定义属性靠 cascade, 因此要求恰好一个无条件 root 级定义 (`isRoot`);
 *   多个 root 定义、只有非 root 定义、只有 `@media` 这类条件 at-rule 内的定义, 一律歧义。
 * - 预处理器变量是顺序求值的, 因此同文件中"引用位置之前的最后一个定义"就是确定答案,
 *   不构成歧义; 只有跨文件出现多个定义时才无从判断顺序。
 *
 * 这里**不做 `var()` 链展开**: 展开需要在 component value 树上做, 且颜色函数片段
 * (`rgb(var(--c) / .4)`) 与变量自身的值 (`--a: var(--b)`) 是同一个替换动作,
 * 由 core 的值层统一负责 (方案 U3-1), 避免两层各写一遍递归与循环检测。
 */
import type {
  LookupSite,
  VariableCandidate,
  VariableDefinition,
  VariableLookup,
  VariableSymbols,
} from './types.js';

function isCustomProperty(name: string): boolean {
  return name.startsWith('--');
}

/** 候选来源的可读描述: 优先用祖先链, 退化到选择器, 再退化到文件。 */
function originOf(definition: VariableDefinition): string {
  const chain = definition.ancestorChain;
  if (chain && chain.length > 0) return chain.join(' › ');
  if (definition.selector) return definition.selector;
  return definition.sourceUri;
}

function candidateOf(definition: VariableDefinition): VariableCandidate {
  return {
    rawValue: definition.rawValue,
    origin: originOf(definition),
    sourceUri: definition.sourceUri,
  };
}

function ambiguous(definitions: readonly VariableDefinition[]): VariableLookup {
  return { kind: 'ambiguous', candidates: definitions.map(candidateOf) };
}

function resolved(definition: VariableDefinition): VariableLookup {
  return { kind: 'resolved', rawValue: definition.rawValue, sourceUri: definition.sourceUri };
}

/**
 * 自定义属性。
 *
 * 要区分两种"不唯一", 它们的结论不同:
 * - **环境相关**: `@media (prefers-color-scheme: dark) { :root { … } }` 这类条件 at-rule 内的
 *   root 定义, 与文档级默认值同时成立且互斥, 取哪个由运行环境决定 → 歧义;
 * - **元素相关**: `.button { --brand: … }` 这类局部定义只在匹配的元素上生效, 而 root 定义
 *   仍然是其余元素的取值 → 仍按 root 定义解析。这与改造前"root 定义可解析, 局部定义不猜
 *   cascade 胜者"的既有契约一致, 不让常见的组件级覆盖把整个变量变成歧义。
 */
function lookupCustomProperty(definitions: readonly VariableDefinition[]): VariableLookup {
  const unconditional = definitions.filter((definition) => definition.isRoot === true);
  const conditional = definitions.filter((definition) => definition.conditional === true);

  // 多个无条件 root 定义: cascade 胜者取决于文档顺序与文件加载顺序, 不猜。
  if (unconditional.length !== 1) return ambiguous(definitions);
  // 存在条件 at-rule 内的定义: 取值随环境切换, 不猜。
  if (conditional.length > 0) return ambiguous(definitions);
  return resolved(unconditional[0]);
}

/**
 * 预处理器变量: 顺序求值。
 *
 * 同文件中取"引用位置之前的最后一个定义" —— 这是确定的, 不是猜测。顶层声明优先于
 * 嵌套在选择器里的声明 (后者本应只在该块内可见, 这里不做精确作用域分析, 但不让它
 * 盖掉顶层定义)。同文件没有可用定义时才看其他文件。
 */
function lookupPreprocessor(
  definitions: readonly VariableDefinition[],
  site: LookupSite,
): VariableLookup {
  const before = definitions.filter(
    (definition) => definition.sourceUri === site.fromUri && definition.offset < site.atOffset,
  );
  if (before.length > 0) {
    const topLevel = before.filter((definition) => definition.isRoot === true);
    const usable = topLevel.length > 0 ? topLevel : before;
    return resolved(usable[usable.length - 1]);
  }

  const elsewhere = definitions.filter((definition) => definition.sourceUri !== site.fromUri);
  if (elsewhere.length === 1) return resolved(elsewhere[0]);
  if (elsewhere.length > 1) return ambiguous(elsewhere);
  // 只有本文件里位置之后的定义: 预处理器此时还没赋值。
  return { kind: 'unresolved', reason: 'no-definition' };
}

/** 查一个变量。`name` 含前缀 (`--brand` / `$brand` / `@brand`)。 */
export function lookupVariable(
  name: string,
  site: LookupSite,
  symbols: VariableSymbols,
): VariableLookup {
  const definitions = symbols.definitions.get(name);
  if (!definitions || definitions.length === 0) {
    return { kind: 'unresolved', reason: 'no-definition' };
  }
  return isCustomProperty(name)
    ? lookupCustomProperty(definitions)
    : lookupPreprocessor(definitions, site);
}

/** 空符号表; 索引尚未就绪时使用。 */
export function emptySymbols(version = 0): VariableSymbols {
  return { definitions: new Map(), colorProfileFallbacks: new Map(), version };
}
