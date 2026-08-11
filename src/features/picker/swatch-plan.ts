/**
 * 色块上报计划与探测缓存策略 (纯计算, 不引用 vscode API)。
 *
 * 四件事:
 * - 按字段表过滤语法 (与高亮同一份范围);
 * - 去掉已被其他颜色提供器覆盖的 range (`dedupe` 模式);
 * - 按 `editor.colorDecoratorsLimit` 截断, 避免把渲染端根本不会画的数据跨进程传过去;
 * - 决定一次探测结果能不能进缓存, 以及缓存怎么按文档隔离与淘汰。
 */
import type { ColorMatch, ColorRange } from '../../core/types.js';

/** range 的稳定键; 与其他提供器比对时按精确 range 匹配。 */
export function rangeKey(range: ColorRange): string {
  return `${range.start}:${range.end}`;
}

/** 探测缓存最多保留多少个文档; 与索引管理器的隐藏文档上限同量级。 */
export const PROBE_CACHE_LIMIT = 50;

export interface ProbeEntry {
  readonly version: number;
  readonly covered: ReadonlySet<string>;
}

/**
 * 一次探测结果是否可以进缓存。
 *
 * 空结果有两种来源, 必须区别对待:
 * - 其他提供器**还没就绪** (本扩展是 `onStartupFinished`, 内置 CSS 是 `onLanguage:*`,
 *   工作区启动时就打开的文件很容易撞上): 这是暂态, 缓存下来会让"没人覆盖"被钉死到
 *   文档下一次改动为止, 表现为色块重复且不产生任何错误日志;
 * - 其他提供器就绪了但确实没给颜色 (例如颜色只出现在注释或字符串里): 这是稳定事实,
 *   可以缓存。
 *
 * 非空结果无条件可缓存。
 */
export function shouldCacheProbe(coveredSize: number, otherProvidersReady: boolean): boolean {
  if (coveredSize > 0) return true;
  return otherProvidersReady;
}

/** 读缓存; 文档版本不匹配视为未命中, 因此版本一变自动失效。 */
export function readProbeCache(
  cache: ReadonlyMap<string, ProbeEntry>,
  uri: string,
  version: number,
): ReadonlySet<string> | undefined {
  const entry = cache.get(uri);
  return entry && entry.version === version ? entry.covered : undefined;
}

/**
 * 写缓存, 每个 uri 只保留一条 (新版本直接覆盖旧版本)。
 *
 * 超出上限时按插入顺序淘汰最旧的条目: 提供器没有文档关闭事件可挂, 只能靠上限兜住增长。
 */
export function writeProbeCache(
  cache: Map<string, ProbeEntry>,
  uri: string,
  entry: ProbeEntry,
  limit: number = PROBE_CACHE_LIMIT,
): void {
  // 先删后插, 使已存在的 uri 也移动到插入顺序末尾, 淘汰时才是真正的"最旧"。
  cache.delete(uri);
  cache.set(uri, entry);
  while (cache.size > limit) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export interface SwatchPlanOptions {
  /** 字段表过滤: 该语法是否参与高亮与色块。 */
  readonly allows: (syntax: string) => boolean;
  /** 该 match 是否有可预览的颜色 (resolved 或已采用假设值)。 */
  readonly hasPreview: (match: ColorMatch) => boolean;
  /** 其他提供器已覆盖的 range 键; `dedupe` 模式外传空集合。 */
  readonly covered?: ReadonlySet<string>;
  /** 渲染端上限, 超出部分不上报。 */
  readonly limit: number;
}

export interface SwatchPlan {
  readonly matches: readonly ColorMatch[];
  /** 因上限被丢弃的数量, 供日志说明"不是没识别, 是渲染端画不了"。 */
  readonly dropped: number;
}

export function planSwatches(
  matches: readonly ColorMatch[],
  options: SwatchPlanOptions,
): SwatchPlan {
  const kept: ColorMatch[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const match of matches) {
    if (!options.allows(match.syntax)) continue;
    if (!options.hasPreview(match)) continue;
    const key = rangeKey(match.range);
    // 同一 range 只上报一次; 已被别人覆盖的也跳过。
    if (seen.has(key)) continue;
    if (options.covered?.has(key)) continue;
    seen.add(key);
    if (kept.length >= options.limit) {
      dropped += 1;
      continue;
    }
    kept.push(match);
  }

  return { matches: kept, dropped };
}
