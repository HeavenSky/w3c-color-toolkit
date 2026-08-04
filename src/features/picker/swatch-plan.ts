/**
 * 色块上报计划 (纯计算, 不引用 vscode API)。
 *
 * 三件事:
 * - 按字段表过滤语法 (与高亮同一份范围);
 * - 去掉已被其他颜色提供器覆盖的 range (`dedupe` 模式);
 * - 按 `editor.colorDecoratorsLimit` 截断, 避免把渲染端根本不会画的数据跨进程传过去。
 */
import type { ColorMatch, ColorRange } from '../../core/types.js';

/** range 的稳定键; 与其他提供器比对时按精确 range 匹配。 */
export function rangeKey(range: ColorRange): string {
  return `${range.start}:${range.end}`;
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
