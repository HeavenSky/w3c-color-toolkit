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
 * - 预处理器变量按块作用域求值: 同文件中在引用可见的最内层作用域里取定义就是确定答案,
 *   不构成歧义; 只有跨文件出现多个顶层定义时才无从判断顺序。
 *
 * 这里**不做 `var()` 链展开**: 展开需要在 component value 树上做, 且颜色函数片段
 * (`rgb(var(--c) / .4)`) 与变量自身的值 (`--a: var(--b)`) 是同一个替换动作,
 * 由 core 的值层统一负责 (方案 U3-1), 避免两层各写一遍递归与循环检测。
 */
import type { VariableValue } from "../core/types.js";

import type {
	LookupSite,
	VariableCandidate,
	VariableDefinition,
	VariableLookup,
	VariableSymbols,
} from "./types.js";

function isCustomProperty(name: string): boolean {
	return name.startsWith("--");
}

/** 候选来源的可读描述: 优先用祖先链, 退化到选择器, 再退化到文件。 */
function originOf(definition: VariableDefinition): string {
	const chain = definition.ancestorChain;
	if (chain && chain.length > 0) return chain.join(" › ");
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
	return { kind: "ambiguous", candidates: definitions.map(candidateOf) };
}

function resolved(definition: VariableDefinition): VariableLookup {
	return { kind: "resolved", rawValue: definition.rawValue, sourceUri: definition.sourceUri };
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
	const unconditional = definitions.filter(definition => definition.isRoot === true);
	const conditional = definitions.filter(definition => definition.conditional === true);

	// 多个无条件 root 定义: cascade 胜者取决于文档顺序与文件加载顺序, 不猜。
	if (unconditional.length !== 1) return ambiguous(definitions);
	// 存在条件 at-rule 内的定义: 取值随环境切换, 不猜。
	if (conditional.length > 0) return ambiguous(definitions);
	return resolved(unconditional[0]);
}

/** 引用位置是否落在定义所在块内; 顶层定义在整个文件可见。 */
function visibleAt(definition: VariableDefinition, atOffset: number): boolean {
	const scope = definition.scope;
	return scope === undefined || (scope.start <= atOffset && atOffset < scope.end);
}

/**
 * 预处理器变量: 从引用所在的最内层作用域向外找, 在第一个有可用定义的作用域取最后一个。
 *
 * 两种方言的"可用"不同: SCSS 顺序求值, 只认引用之前的定义; Less 惰性求值,
 * 同一作用域内最后一个定义生效, 无论它写在引用之前还是之后。
 * 包含同一位置的块彼此嵌套, 因此起点越大的作用域越靠内。
 * 同文件没有可用定义时才看其他文件的顶层定义。
 */
function lookupPreprocessor(
	definitions: readonly VariableDefinition[],
	site: LookupSite
): VariableLookup {
	const usable = definitions.filter(
		definition =>
			definition.sourceUri === site.fromUri &&
			visibleAt(definition, site.atOffset) &&
			(definition.kind === "less" || definition.offset < site.atOffset)
	);
	if (usable.length > 0) {
		const innermost = Math.max(...usable.map(definition => definition.scope?.start ?? -1));
		const inScope = usable
			.filter(definition => (definition.scope?.start ?? -1) === innermost)
			.sort((a, b) => a.offset - b.offset);
		return resolved(inScope[inScope.length - 1]);
	}

	const elsewhere = definitions.filter(
		definition => definition.sourceUri !== site.fromUri && definition.scope === undefined
	);
	if (elsewhere.length === 1) return resolved(elsewhere[0]);
	if (elsewhere.length > 1) return ambiguous(elsewhere);
	// 只有本文件里位置之后的 SCSS 定义, 或只有引用不可见的块内定义。
	return { kind: "unresolved", reason: "no-definition" };
}

/** 查一个变量。`name` 含前缀 (`--brand` / `$brand` / `@brand`)。 */
export function lookupVariable(
	name: string,
	site: LookupSite,
	symbols: VariableSymbols
): VariableLookup {
	const definitions = symbols.definitions.get(name);
	if (!definitions || definitions.length === 0) {
		return { kind: "unresolved", reason: "no-definition" };
	}
	return isCustomProperty(name)
		? lookupCustomProperty(definitions)
		: lookupPreprocessor(definitions, site);
}

/** 空符号表; 索引尚未就绪时使用。 */
export function emptySymbols(version = 0): VariableSymbols {
	return { definitions: new Map(), colorProfileFallbacks: new Map(), version };
}

/**
 * 查表结果 → core 的取值形状。
 *
 * core 不反向依赖 adapters, 因此两边各有一个等价类型, 由这里做一次映射;
 * 映射只丢掉 `sourceUri` 这类 core 用不到的信息。
 */
export function toVariableValue(lookup: VariableLookup): VariableValue {
	switch (lookup.kind) {
		case "resolved":
			return { kind: "resolved", rawValue: lookup.rawValue };
		case "ambiguous":
			return {
				kind: "ambiguous",
				candidates: lookup.candidates.map(candidate => ({
					rawValue: candidate.rawValue,
					origin: candidate.origin,
				})),
			};
		default:
			return { kind: "unresolved" };
	}
}
