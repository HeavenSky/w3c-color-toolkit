/**
 * 文档扫描: 找出颜色表达式的精确范围并交给 parser 求值。
 *
 * 规则要点:
 * - 使用 CSS token 流与 component value 树, 不用单个大正则解析颜色函数;
 * - 嵌套表达式默认只返回最外层成功解析的颜色;
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
import { parseComponentValueColor, type ParseOptions } from './parser.js';
import type { ColorMatch, ColorRange } from './types.js';

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

/** 由裸标识符构成的语法, 需要额外做属性名位置检查。 */
const IDENT_SYNTAXES: ReadonlySet<string> = new Set([
  'named-color',
  'transparent',
  'current-color',
  'system-color',
  'deprecated-system-color',
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
  readonly node: ComponentValue;
  readonly range: ColorRange;
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

/** 收集候选节点, 只走最外层; 外层解析失败时再下降一层。 */
function collectCandidates(
  nodes: readonly ComponentValue[],
  offset: number,
  options: ScanOptions,
  out: Candidate[],
  inDynamicRangeLimit: boolean,
  whitelist: ReadonlySet<string>,
): void {
  for (const node of nodes) {
    const range = nodeRange(node, offset);
    if (!range) continue;

    if (isFunctionNode(node)) {
      const name = functionName(node) ?? '';
      if (isDynamicRangeLimitFunction(name)) {
        // 非颜色值: 既不产生 match, 也不下降到内部关键字。
        continue;
      }
      if (whitelist.has(name) || isExperimentalFunction(name)) {
        out.push({ node, range });
        continue;
      }
      // 非颜色函数 (如 `var()`、`linear-gradient()`) 继续检查内部独立颜色。
      collectCandidates(node.value, offset, options, out, inDynamicRangeLimit, whitelist);
      continue;
    }

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
  const kept: ColorMatch[] = [];
  for (const match of sorted) {
    const last = kept[kept.length - 1];
    if (!last || last.range.end <= match.range.start) {
      kept.push(match);
      continue;
    }
    const lastLength = last.range.end - last.range.start;
    const matchLength = match.range.end - match.range.start;
    const better =
      matchLength > lastLength ||
      (matchLength === lastLength && priority(match) > priority(last));
    if (better) kept[kept.length - 1] = match;
  }
  return kept;
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
      const parsed = parseComponentValueColor(candidate.node, options);

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
