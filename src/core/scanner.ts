/**
 * 文档扫描: 找出颜色表达式的精确范围并交给 parser 求值。
 *
 * 规则要点:
 * - 使用 CSS token 流与 component value 树, 不用单个大正则解析颜色函数;
 * - 嵌套表达式默认只返回最外层成功解析的颜色, 例外是变量引用: `var()` 与颜色函数实参里的
 *   变量各自也成为候选, 因为它们各自要有色块;
 * - hex 与颜色名做标识符边界检查, 避免 URL fragment、UUID、类名片段误报;
 * - `dynamic-range-limit` 上下文中的关键字与 `dynamic-range-limit-mix()` 不产生颜色 match;
 * - 结果稳定排序并去重, 重叠时按固定优先级取舍。
 */
import {
  functionName,
  isFunctionNode,
  isTokenNode,
  nodeSourceIndices,
  parseComponentValues,
  tokenizeCss,
  type ComponentValue,
} from './csstools-bridge.js';
import {
  DYNAMIC_RANGE_LIMIT_KEYWORDS,
  DYNAMIC_RANGE_LIMIT_PROPERTY,
  functionWhitelist,
  isDynamicRangeLimitFunction,
  isExperimentalFunction,
  lookupDeprecatedSystemColor,
  lookupNamedColor,
  lookupSystemColor,
  TRANSPARENT_KEYWORD,
} from './keywords.js';
import { classifyCssVariable, classifyPreprocessorVariable } from './contextual.js';
import {
  parseColorText,
  parseComponentValueColor,
  type ParsedColor,
  type ParseOptions,
} from './parser.js';
import type { ColorMatch, ColorRange, ResolveVariable } from './types.js';
import { substituteVariables } from './variable-substitution.js';

/** 颜色名的识别范围。 */
export type MatchWords = 'off' | 'css-like' | 'all';

export interface ScanOptions extends ParseOptions {
  readonly matchWords: MatchWords;
  /** 当前文档语言是否属于 CSS 系列, 决定 `css-like` 是否生效。 */
  readonly cssLikeLanguage: boolean;
  readonly scanComments: boolean;
  readonly scanStrings: boolean;
  /** 超过该数量后停止扫描, 由调用方决定如何提示。 */
  readonly maxMatches: number;
  /**
   * 是否识别变量引用 (`var()`、`$name`、`@name`)。
   *
   * 与 `cssLikeLanguage` 分开: 后者决定的是"裸颜色名在哪些语言里算颜色", 两件事共用一个
   * 开关会让 `tailwindcss` 这类语言连变量都识别不了。缺省时回落到 `cssLikeLanguage`。
   */
  readonly variableSyntax?: boolean;
  /**
   * 变量取值回调; 由 adapters 侧的符号索引注入。
   *
   * 不提供时变量引用一律解析不出来, 于是不产出 match (静默) —— 与关闭变量解析等效。
   */
  readonly resolveVariable?: ResolveVariable;
  /** `var()` 代换的轮数上限; 对应 `advanced.variables.maxResolveDepth`。 */
  readonly maxResolveDepth?: number;
}

/** 是否识别变量引用。 */
function variablesEnabled(options: ScanOptions): boolean {
  return options.variableSyntax ?? options.cssLikeLanguage;
}

export interface ScanResult {
  readonly matches: readonly ColorMatch[];
  /** 命中上限被截断。 */
  readonly truncated: boolean;
}

const CSS_LIKE_LANGUAGES: ReadonlySet<string> = new Set([
  'css',
  'scss',
  'sass',
  'less',
  'stylus',
  'postcss',
]);

export function isCssLikeLanguage(languageId: string): boolean {
  return CSS_LIKE_LANGUAGES.has(languageId);
}

/**
 * 识别变量引用的语言。
 *
 * 与 `CSS_LIKE_LANGUAGES` 分开的两处差异都是刻意的:
 * - 含 `tailwindcss` —— Tailwind CSS IntelliSense 注册了这个语言, 用它打开的 CSS 文件
 *   若不在表内会连 `var()` 都识别不了;
 * - 不含 `stylus` —— Stylus 不解析变量 (方案 D3), 它的颜色识别不受影响。
 */
const VARIABLE_LANGUAGES: ReadonlySet<string> = new Set([
  'css',
  'scss',
  'sass',
  'less',
  'postcss',
  'tailwindcss',
]);

export function isVariableLanguage(languageId: string): boolean {
  return VARIABLE_LANGUAGES.has(languageId);
}

/** 由裸标识符构成的语法, 需要额外做属性名位置检查。 */
const IDENT_SYNTAXES: ReadonlySet<string> = new Set([
  'named-color',
  'transparent',
  'current-color',
  'system-color',
  'deprecated-system-color',
  // Less 的 `@brand: #ff8800;` 定义位置与 `color: @brand` 引用位置同型,
  // 借这里的属性名位置检查把定义那一侧挡掉。
  'less-variable',
]);

/** 词/标识符边界: 前后不能是标识符字符, 也不能是 `-`、`_` 或 `#`。 */
const IDENT_BOUNDARY = /[A-Za-z0-9_\-#$@]/;

/**
 * 属性名/键位置的标识符不是颜色值。
 *
 * 必须有这个检查, 因为 CSS 属性名与规范关键字存在真实冲突:
 * `background`、`Menu`、`Window`、`Highlight`、`Mark` 等既是 deprecated 系统色,
 * 也是常见的属性名或标识符。判据是紧随其后 (跳过空白) 的字符为 `:`。
 */
function isPropertyPosition(text: string, range: ColorRange): boolean {
  let index = range.end;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index += 1;
  return text[index] === ':';
}

function hasIdentifierBoundary(text: string, range: ColorRange): boolean {
  const before = range.start > 0 ? text[range.start - 1] : '';
  const after = range.end < text.length ? text[range.end] : '';
  if (before && IDENT_BOUNDARY.test(before)) return false;
  if (after && IDENT_BOUNDARY.test(after)) return false;
  return true;
}

/**
 * 位置信息: CSSTools 的 token 第 3、4 项是源码 start/end offset,
 * end 为闭区间, 这里统一转换为开区间。
 */
function nodeRange(node: ComponentValue, offset: number): ColorRange | undefined {
  const indices = nodeSourceIndices(node);
  if (!indices) return undefined;
  return { start: indices[0] + offset, end: indices[1] + 1 + offset };
}

interface Candidate {
  /** 变量候选没有单一节点 (`$brand` 是 delim + ident 两个 token), 因此可缺省。 */
  readonly node?: ComponentValue;
  readonly range: ColorRange;
  /** 变量引用候选; 值为含前缀的变量名, 例如 `--brand` / `$brand` / `@brand`。 */
  readonly variable?: string;
  /**
   * 实参里含 `var()` 的颜色函数。
   *
   * 与 `variable` 的区别: 那个的解析输入是"一个变量名", 这个是"整段原文本" ——
   * `rgb(var(--c) / 0.4)` 里 `--c` 只是函数的一个片段, 必须先代换再解析。
   */
  readonly hasVariables?: boolean;
}

/**
 * 收集范围。
 *
 * - `all`: 默认, 收集全部颜色候选;
 * - `variables`: 只收集变量引用, 用于白名单颜色函数的内部。不收 hex、颜色名与嵌套颜色函数,
 *   因为那会改变本文件开头声明的"嵌套表达式默认只返回最外层"。
 */
type CollectMode = 'all' | 'variables';

/**
 * Less 里 `@name` 与 at-rule 同型, 必须排除后者。
 *
 * 这里只挡住"看起来像 at-rule"的名字; `@brand: …` 这种定义位置的引用由主循环的
 * 属性名位置检查 (`IDENT_SYNTAXES` 含 `less-variable`) 兜住。
 */
const AT_RULE_KEYWORDS: ReadonlySet<string> = new Set([
  'media',
  'supports',
  'import',
  'use',
  'forward',
  'keyframes',
  'font-face',
  'charset',
  'layer',
  'container',
  'page',
  'namespace',
  'property',
  'scope',
  'starting-style',
  'counter-style',
  'font-feature-values',
  'color-profile',
]);

/** `$brand` 的第一个 token: `$` delim。 */
function isDollarDelim(node: ComponentValue): boolean {
  if (!isTokenNode(node)) return false;
  const token = node.value;
  return token[0] === 'delim-token' && (token[4] as { value: string }).value === '$';
}

/** `@brand` 的 at-keyword; 返回不含 `@` 的名字。 */
function atKeywordOfNode(node: ComponentValue): string | undefined {
  if (!isTokenNode(node)) return undefined;
  const token = node.value;
  if (token[0] !== 'at-keyword-token') return undefined;
  return (token[4] as { value: string }).value;
}

/** `var(--brand)` 的第一个自定义属性实参。 */
function customPropertyOfVarNode(node: ComponentValue): string | undefined {
  for (const inner of node.value as ComponentValue[]) {
    const ident = identOfNode(inner);
    if (ident?.startsWith('--')) return ident;
  }
  return undefined;
}

/** 判断标识符是否值得尝试解析为颜色。 */
function identifierIsColorCandidate(ident: string, options: ScanOptions): boolean {
  const lower = ident.toLowerCase();
  if (lower === TRANSPARENT_KEYWORD || lower === 'currentcolor') return true;
  if (lookupSystemColor(ident) || lookupDeprecatedSystemColor(ident)) return true;
  if (!lookupNamedColor(ident)) return false;
  if (options.matchWords === 'off') return false;
  if (options.matchWords === 'css-like') return options.cssLikeLanguage;
  return true;
}

function identOfNode(node: ComponentValue): string | undefined {
  if (!isTokenNode(node)) return undefined;
  const token = node.value;
  if (token[0] !== 'ident-token') return undefined;
  return (token[4] as { value: string }).value;
}

function hashOfNode(node: ComponentValue): string | undefined {
  if (!isTokenNode(node)) return undefined;
  const token = node.value;
  if (token[0] !== 'hash-token') return undefined;
  return (token[4] as { value: string }).value;
}

/** hex 只接受 3/4/6/8 位十六进制。 */
function isValidHexLength(value: string): boolean {
  return (
    /^[0-9a-fA-F]+$/.test(value) &&
    (value.length === 3 || value.length === 4 || value.length === 6 || value.length === 8)
  );
}

/** 变量引用自身的 syntax; 它的源语法确实是"一个引用", 因此不取代换后的语法。 */
function variableSyntaxOf(name: string): string {
  if (name.startsWith('--')) return 'css-variable';
  if (name.startsWith('$')) return 'scss-variable';
  return 'less-variable';
}

interface Evaluated {
  readonly parsed: ParsedColor;
  /** 由变量解析而来 → 只读; 值为被依赖的变量名。 */
  readonly resolvedVia?: { readonly variable: string };
}

/**
 * 取值不唯一时的 contextual 形态。
 *
 * 候选此处先不落进 `branches` —— 把候选映射成分支 (并逐个解析成颜色) 是 Hover 展示的
 * 职责, 见方案 U4。这里只保证"有定义但不唯一"不会被静默丢掉。
 */
function contextualVariable(syntax: string, dependsOn: string): ParsedColor {
  const isPreprocessor = dependsOn.startsWith('$') || dependsOn.startsWith('@');
  const contextual = isPreprocessor
    ? classifyPreprocessorVariable(dependsOn)
    : classifyCssVariable(dependsOn);
  return {
    resolution: 'contextual',
    syntax,
    specLevel: 'color-4',
    experimental: false,
    contextual,
    diagnostics: [],
  };
}

/** 代换后的文本必须真的是一个颜色; 否则该候选不产出 match。 */
function colorOfText(css: string, options: ScanOptions): ParsedColor | undefined {
  const parsed = parseColorText(css, options);
  return parsed?.resolved ? parsed : undefined;
}

/** `var(--brand)` / `$brand` / `@brand` 这类整体引用。 */
function evaluateVariable(
  name: string,
  candidate: Candidate,
  raw: string,
  options: ScanOptions,
  resolve: ResolveVariable,
): Evaluated | undefined {
  const syntax = variableSyntaxOf(name);

  // `var()` 引用走整段代换而不是"查一次表": 它可能带 fallback (取不到值时 fallback 才是
  // CSS 语义下真正生效的那个), 值本身也可能还含 var()。两件事都由代换统一处理。
  if (name.startsWith('--')) {
    const substituted = substituteVariables(raw, resolve, candidate.range.start, options.maxResolveDepth);
    if (substituted.text === undefined) {
      return substituted.ambiguous ? { parsed: contextualVariable(syntax, name) } : undefined;
    }
    const color = colorOfText(substituted.text, options);
    if (!color) return undefined;
    // syntax 保持引用形态, 其余取解析结果。
    return { parsed: { ...color, syntax }, resolvedVia: { variable: name } };
  }

  // 预处理器变量没有 fallback 语法, 直接查表。
  const value = resolve(name, candidate.range.start);
  if (value.kind === 'unresolved') return undefined;
  if (value.kind === 'ambiguous') return { parsed: contextualVariable(syntax, name) };
  const color = colorOfText(value.rawValue, options);
  if (!color) return undefined;
  return { parsed: { ...color, syntax }, resolvedVia: { variable: name } };
}

/** `rgb(var(--c) / 0.4)` 这类"变量只是函数一个片段"的写法。 */
function evaluateVariableFunction(
  candidate: Candidate,
  raw: string,
  options: ScanOptions,
  resolve: ResolveVariable,
): Evaluated | undefined {
  const substituted = substituteVariables(raw, resolve, candidate.range.start, options.maxResolveDepth);
  const syntax = (candidate.node && functionName(candidate.node)) || 'css-variable';
  if (substituted.text === undefined) {
    if (!substituted.ambiguous) return undefined;
    return { parsed: contextualVariable(syntax, substituted.names.join(', ')) };
  }
  const color = colorOfText(substituted.text, options);
  if (!color) return undefined;
  return { parsed: color, resolvedVia: { variable: substituted.names.join(', ') } };
}

/** 求值一个候选; 返回 undefined 表示不产出 match (静默)。 */
function evaluateCandidate(candidate: Candidate, raw: string, options: ScanOptions): Evaluated | undefined {
  const resolve = options.resolveVariable;
  if (candidate.variable !== undefined) {
    // 没有取值回调时变量一律解析不出来, 与关闭变量解析等效。
    return resolve ? evaluateVariable(candidate.variable, candidate, raw, options, resolve) : undefined;
  }
  if (candidate.hasVariables && resolve) {
    return evaluateVariableFunction(candidate, raw, options, resolve);
  }
  return { parsed: parseComponentValueColor(candidate.node as ComponentValue, options) };
}

/** 收集候选节点, 只走最外层; 外层解析失败时再下降一层。 */
function collectCandidates(
  nodes: readonly ComponentValue[],
  offset: number,
  options: ScanOptions,
  out: Candidate[],
  inDynamicRangeLimit: boolean,
  whitelist: ReadonlySet<string>,
  mode: CollectMode = 'all',
): void {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const range = nodeRange(node, offset);
    if (!range) continue;

    // `$brand`: delim + ident 两个 token, 合并成一个候选。
    if (variablesEnabled(options) && isDollarDelim(node)) {
      const next = nodes[index + 1];
      const name = next ? identOfNode(next) : undefined;
      const nextRange = next ? nodeRange(next, offset) : undefined;
      if (name && nextRange && nextRange.start === range.end) {
        out.push({ range: { start: range.start, end: nextRange.end }, variable: `$${name}` });
        index += 1;
        continue;
      }
    }

    // `@brand`: 单个 at-keyword, 但要挡住 at-rule。
    if (variablesEnabled(options)) {
      const atKeyword = atKeywordOfNode(node);
      if (atKeyword !== undefined) {
        if (!AT_RULE_KEYWORDS.has(atKeyword.toLowerCase())) {
          out.push({ range, variable: `@${atKeyword}` });
        }
        continue;
      }
    }

    if (isFunctionNode(node)) {
      const name = functionName(node) ?? '';
      if (isDynamicRangeLimitFunction(name)) {
        // 非颜色值: 既不产生 match, 也不下降到内部关键字。
        continue;
      }
      // `var(--brand)`: 整体成为变量候选, 但**继续下降** —— fallback 与嵌套的 var()
      // 各自还要有色块。
      // 刻意不加进 functionWhitelist —— 那个白名单的语义是"颜色函数", var 不是。
      if (variablesEnabled(options) && name === 'var') {
        const customProperty = customPropertyOfVarNode(node);
        if (customProperty) out.push({ range, variable: customProperty });
        // fallback 里的实色始终按全量收集, 这样 `rgb(var(--a, #fff) / .4)` 的 `#fff`
        // 与 `var(--a, #fff)` 单独出现时得到同样的色块。
        collectCandidates(node.value, offset, options, out, inDynamicRangeLimit, whitelist);
        continue;
      }
      if (whitelist.has(name) || isExperimentalFunction(name)) {
        if (mode === 'variables') {
          // 仅变量模式下内层颜色函数自己不产出候选, 只继续往里找变量引用。
          collectCandidates(node.value, offset, options, out, inDynamicRangeLimit, whitelist, mode);
          continue;
        }
        // 实参含 `var()` 时整个函数无法静态求值 —— CSSTools 判 invalid, 主循环会把它整条丢掉,
        // 而代换变量之后它是可解析的。因此标记为"含变量", 求值时先代换; 同时继续下降,
        // 让内层引用各自也有色块 (与上面 `var()` 分支的取舍一致)。
        const inner: Candidate[] = [];
        collectCandidates(node.value, offset, options, inner, inDynamicRangeLimit, whitelist, 'variables');
        const hasVariables = inner.some(
          (candidate) => candidate.variable !== undefined && candidate.variable.startsWith('--'),
        );
        // 先压外层: 命中 `maxMatches` 时该保留的是范围更大的那个。
        out.push(hasVariables ? { node, range, hasVariables } : { node, range });
        out.push(...inner);
        continue;
      }
      // 非颜色函数 (如 `linear-gradient()`) 继续检查内部独立颜色。
      collectCandidates(node.value, offset, options, out, inDynamicRangeLimit, whitelist, mode);
      continue;
    }

    if (mode === 'variables') continue;

    const hash = hashOfNode(node);
    if (hash !== undefined) {
      if (isValidHexLength(hash)) out.push({ node, range });
      continue;
    }

    const ident = identOfNode(node);
    if (ident !== undefined) {
      if (inDynamicRangeLimit && DYNAMIC_RANGE_LIMIT_KEYWORDS.includes(ident.toLowerCase())) continue;
      if (identifierIsColorCandidate(ident, options)) out.push({ node, range });
      continue;
    }

    if (!isTokenNode(node) && 'value' in node && Array.isArray(node.value)) {
      collectCandidates(node.value as ComponentValue[], offset, options, out, inDynamicRangeLimit, whitelist);
    }
  }
}

/** 重叠时的优先级: 范围更大且可解析 > 范围更小 > contextual > invalid。 */
function priority(match: ColorMatch): number {
  switch (match.resolution) {
    case 'resolved':
      return 3;
    case 'contextual':
      return 2;
    default:
      return 1;
  }
}

function dedupe(matches: readonly ColorMatch[]): ColorMatch[] {
  // 排序: 起点升序 → 范围更大优先 → 优先级更高优先。
  const sorted = [...matches].sort((a, b) => {
    if (a.range.start !== b.range.start) return a.range.start - b.range.start;
    const lengthDiff = b.range.end - b.range.start - (a.range.end - a.range.start);
    if (lengthDiff !== 0) return lengthDiff;
    return priority(b) - priority(a);
  });

  // 单次线性扫描: 因为已按起点排序, 只需与上一个保留项比较。
  // (早期实现对每个候选都遍历已保留列表, 在上万个 match 的文件上会退化为 O(n^2)。)
  //
  // 落选项不再直接丢弃: 被更大范围吞掉的就是嵌套颜色, 挂到胜出项的 `nested` 上供色块使用。
  // 这里复用本算法已有的信息, 不需要另跑一趟包含关系判定。
  const kept: ColorMatch[] = [];
  const swallowed: ColorMatch[][] = [];
  for (const match of sorted) {
    const last = kept[kept.length - 1];
    if (!last || last.range.end <= match.range.start) {
      kept.push(match);
      swallowed.push([]);
      continue;
    }
    const lastLength = last.range.end - last.range.start;
    const matchLength = match.range.end - match.range.start;
    const better =
      matchLength > lastLength ||
      (matchLength === lastLength && priority(match) > priority(last));
    if (better) {
      // 部分重叠 (非包含) 才会走到这里; 颜色候选来自 component value 树, 实际不会出现。
      // 仍定义行为: 旧末项连同它已收集的嵌套一起并入新胜出项, 不凭空丢失。
      const previous = swallowed[swallowed.length - 1];
      kept[kept.length - 1] = match;
      swallowed[swallowed.length - 1] = [last, ...previous];
      continue;
    }
    swallowed[swallowed.length - 1].push(match);
  }

  return kept.map((match, index) =>
    swallowed[index].length > 0 ? { ...match, nested: swallowed[index] } : match,
  );
}

/**
 * 注释与字符串: CSS token 流会把它们作为独立 token,
 * 需要按配置决定是否深入其内容扫描 (旧 Color Highlight 支持任意文本中的颜色)。
 */
interface TextSegment {
  readonly text: string;
  readonly offset: number;
}

function segmentsFor(text: string, options: ScanOptions): TextSegment[] {
  const segments: TextSegment[] = [{ text, offset: 0 }];
  if (!options.scanComments && !options.scanStrings) return segments;

  const extra: TextSegment[] = [];
  for (const token of tokenizeCss(text)) {
    const type = token[0];
    if (options.scanComments && type === 'comment') {
      const raw = token[1];
      const inner = raw.replace(/^\/\*/, '').replace(/\*\/$/, '');
      extra.push({ text: inner, offset: token[2] + 2 });
    }
    if (options.scanStrings && type === 'string-token') {
      const value = (token[4] as { value: string }).value;
      // 引号占 1 个字符, 内容从 start + 1 开始; 含转义时跳过以免范围错位。
      if (token[1].length === value.length + 2) {
        extra.push({ text: value, offset: token[2] + 1 });
      }
    }
  }
  return [...segments, ...extra];
}

/** 扫描一段文本。 */
export function scanText(text: string, options: ScanOptions): ScanResult {
  const matches: ColorMatch[] = [];
  let truncated = false;
  // 白名单在整次扫描中不变, 必须在循环外构造 (放在循环里会为每个函数节点重建 Set)。
  const whitelist = functionWhitelist({
    cssColor6: options.cssColor6,
    cssColorHdr: options.cssColorHdr,
  });

  for (const segment of segmentsFor(text, options)) {
    const nodes = parseComponentValues(segment.text);
    const candidates: Candidate[] = [];
    const inDynamicRangeLimit = segment.text.includes(DYNAMIC_RANGE_LIMIT_PROPERTY);
    collectCandidates(nodes, segment.offset, options, candidates, inDynamicRangeLimit, whitelist);

    for (const candidate of candidates) {
      if (matches.length >= options.maxMatches) {
        truncated = true;
        break;
      }
      const raw = text.slice(candidate.range.start, candidate.range.end);
      // Less 的 `@brand: …` 定义位置与引用位置同型; 先挡掉再求值, 省掉一次无用解析。
      if (candidate.variable?.startsWith('@') && isPropertyPosition(text, candidate.range)) continue;

      const evaluated = evaluateCandidate(candidate, raw, options);
      if (!evaluated) continue;
      const parsed = evaluated.parsed;

      // hex 与颜色名需要标识符边界检查。
      const needsBoundary = parsed.syntax === 'hex' || parsed.syntax === 'named-color';
      if (needsBoundary && !hasIdentifierBoundary(text, candidate.range)) continue;

      // 裸关键字出现在属性名位置时不是颜色值。
      if (IDENT_SYNTAXES.has(parsed.syntax) && isPropertyPosition(text, candidate.range)) continue;

      // 无法识别的语法不进入结果, 避免把普通标识符标成颜色。
      if (parsed.resolution === 'invalid' && parsed.diagnostics.every((d) => d.code === 'unknown-function')) {
        continue;
      }

      matches.push({
        raw,
        range: candidate.range,
        syntax: parsed.syntax,
        specLevel: parsed.specLevel,
        experimental: parsed.experimental,
        sourceSpace: parsed.sourceSpace,
        resolution: parsed.resolution,
        resolved: parsed.resolved,
        contextual: parsed.contextual,
        diagnostics: parsed.diagnostics,
        ...(evaluated.resolvedVia ? { resolvedVia: evaluated.resolvedVia } : {}),
      });
    }
    if (truncated) break;
  }

  return { matches: dedupe(matches), truncated };
}

/** 在已排序的 match 列表中按 offset 查找。 */
export function findMatchAtOffset(
  matches: readonly ColorMatch[],
  offset: number,
): ColorMatch | undefined {
  let low = 0;
  let high = matches.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const match = matches[mid];
    if (offset < match.range.start) high = mid - 1;
    else if (offset >= match.range.end) low = mid + 1;
    else return match;
  }
  return undefined;
}
