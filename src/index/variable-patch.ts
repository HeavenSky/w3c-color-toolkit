/**
 * 把扫描器产出的变量引用占位 match 解析成真实颜色, 解析不出来的就地移除。
 *
 * 为什么是"补丁"而不是"带变量重扫":
 * 变量上下文要跨文件读取, 只能异步拿到; 而 500KB 文件的一次全量扫描 p95 已达 7.5 秒
 * (预算 150ms, 见 `test/performance/scan.test.ts`)。拿到上下文后再全量重扫会让开销翻倍,
 * 因此改成只对变量 match 做补丁 —— 开销与变量引用数成正比, 而不是与文件大小成正比。
 *
 * 为什么放在 `src/index/` 而不是 `src/features/`:
 * 消费者是 `document-color-index.ts`, 而 `features/*` 已经反向依赖 `index/*`
 * (例如 `highlight-controller.ts` import `DocumentIndexManager`), 放进 features 会让
 * index → features → index 在模块图上成环。
 *
 * 本文件不引用 vscode API, 便于在单元测试中直接驱动。
 */
import { resolveVariable } from '../adapters/variable-context.js';
import type { VariableContext } from '../adapters/types.js';
import { parseColorText, type ParseOptions } from '../core/parser.js';
import type { ColorMatch } from '../core/types.js';

/** 扫描器为变量引用产出的三种 syntax。 */
const VARIABLE_SYNTAXES: ReadonlySet<string> = new Set([
  'css-variable',
  'scss-variable',
  'less-variable',
]);

export interface PatchOptions {
  readonly parseOptions: ParseOptions;
  readonly maxResolveDepth: number;
}

/** 是否为尚未解析的变量引用占位。 */
export function isVariableMatch(match: ColorMatch): boolean {
  return VARIABLE_SYNTAXES.has(match.syntax) && match.resolvedVia === undefined;
}

/**
 * 解析变量 match。
 *
 * - 解析成功 → 替换为 `resolved`, 并带上 `resolvedVia` 标记只读;
 * - 解析失败 → **从结果中移除**;
 * - `context` 为 `undefined` → 移除全部变量 match。
 *
 * "解析失败就静默"是刻意的: 无定义, 多个 `:root` 定义, 含运算, 循环引用, 超深度与
 * 未受信任工作区都会走到这里。留一个没有颜色的 match 会让 SCSS 里每个 `$foo` 都弹出
 * Hover 面板, 而改造前它们本来什么都不弹。
 *
 * 非变量 match 原样保留, 顺序不变。
 */
export function patchVariableMatches(
  matches: readonly ColorMatch[],
  context: VariableContext | undefined,
  options: PatchOptions,
): readonly ColorMatch[] {
  // 没有任何待解析变量时不复制数组: 绝大多数文档都走这条路。
  // 必须连 `nested` 一起看 —— 索引管理器会对已补丁过的快照再跑一次, 那时顶层变量
  // 可能已经是 resolved 而嵌套里的还没解析, 只看顶层会让整棵嵌套永远得不到解析。
  if (!matches.some(hasPendingVariable)) return matches;

  const out: ColorMatch[] = [];
  for (const match of matches) {
    const nested = match.nested ? patchVariableMatches(match.nested, context, options) : undefined;

    if (!isVariableMatch(match)) {
      out.push(withNested(match, nested));
      continue;
    }

    const patched = context ? resolveOne(match, context, options) : undefined;
    if (patched) {
      out.push(withNested(patched, nested));
      continue;
    }
    // 外层解析失败被移除, 但内层的实色不该跟着消失:
    // `var(--missing, #ff8800)` 里的 fallback 正是 CSS 语义下真正生效的颜色。
    if (nested) out.push(...nested);
  }
  return out;
}

/** 自身或任一后代是待解析的变量引用。 */
function hasPendingVariable(match: ColorMatch): boolean {
  if (isVariableMatch(match)) return true;
  return match.nested?.some(hasPendingVariable) ?? false;
}

/** 空的 nested 置为 undefined, 避免留下 `nested: []` 这种噪音。 */
function withNested(match: ColorMatch, nested: readonly ColorMatch[] | undefined): ColorMatch {
  if (nested === match.nested) return match;
  if (!nested || nested.length === 0) {
    if (match.nested === undefined) return match;
    const { nested: _dropped, ...rest } = match;
    return rest;
  }
  return { ...match, nested };
}

function resolveOne(
  match: ColorMatch,
  context: VariableContext,
  options: PatchOptions,
): ColorMatch | undefined {
  const variable = match.contextual?.dependsOn;
  if (!variable) return undefined;

  const resolution = resolveVariable(variable, match.range.start, context, options.maxResolveDepth);
  if (resolution.kind !== 'resolved') return undefined;

  // 变量的值是原始文本 (例如 `#ff8800`), 还要再解析一次才是颜色。
  const parsed = parseColorText(resolution.rawValue, options.parseOptions);
  if (!parsed?.resolved) return undefined;

  return {
    ...match,
    syntax: match.syntax,
    resolution: 'resolved',
    resolved: parsed.resolved,
    sourceSpace: parsed.sourceSpace,
    // contextual 必须清掉: 它描述的是"未解析"状态, 留着会让 Hover 同时显示两种结论。
    contextual: undefined,
    diagnostics: parsed.diagnostics,
    resolvedVia: { variable },
  };
}
