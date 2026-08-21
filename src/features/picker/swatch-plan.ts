/**
 * 色块上报计划与探测策略 (纯计算, 不引用 vscode API)。
 *
 * 五件事:
 * - 按字段表过滤语法 (与高亮同一份范围);
 * - 去掉已被其他颜色提供器覆盖的 range (`dedupe` 模式);
 * - 按 `editor.colorDecoratorsLimit` 截断, 避免把渲染端根本不会画的数据跨进程传过去;
 * - 算出"哪些语言里有内置提供器也会给颜色", 决定要不要探测;
 * - 决定一次探测结果能不能进缓存, 以及缓存怎么按文档隔离与淘汰。
 */
import type { ColorMatch, ColorRange } from '../../core/types.js';

/** range 的稳定键; 与其他提供器比对时按精确 range 匹配。 */
export function rangeKey(range: ColorRange): string {
  return `${range.start}:${range.end}`;
}

/**
 * 一个内置语言服务扩展, 以及它在哪些语言里提供颜色。
 *
 * `participantsKey` 是它读取的"语言参与者"贡献点: 这两个语言服务都允许任意扩展把自己的
 * 语言挂进去 (内置的 handlebars 扩展就是这样让 `handlebars` 走 HTML 语言服务的),
 * 因此语言集合不是常量, 必须在运行时把所有扩展的这个贡献点合并进来。
 */
export interface BuiltInColorProvider {
  readonly extensionId: string;
  readonly baseLanguageIds: readonly string[];
  readonly participantsKey?: string;
}

/**
 * 会提供颜色的三个内置扩展 (2026-08-13 实测 VS Code 1.130.0 随附的内置扩展)。
 *
 * 判据是它们的 server 能力里声明了 `colorProvider`, 而不是"看起来和颜色有关":
 * - `vscode.css-language-features`: css / less / scss, 激活事件即这三种语言;
 * - `vscode.html-language-features`: 内嵌 CSS (`<style>` 与 style 属性), 基础语言只有
 *   `html`, `handlebars` 来自参与者贡献点;
 * - `vscode.json-language-features`: schema 标了 `format: color-hex` / `color` 的字符串,
 *   例如主题文件与 `settings.json` 里的 `workbench.colorCustomizations`。
 *
 * `vscode.markdown-language-features` 打包了 languageclient 的颜色特性代码, 但它的语言
 * 服务没有声明该能力, 所以不在此列。
 */
export const BUILT_IN_COLOR_PROVIDERS: readonly BuiltInColorProvider[] = [
  { extensionId: 'vscode.css-language-features', baseLanguageIds: ['css', 'less', 'scss'] },
  {
    extensionId: 'vscode.html-language-features',
    baseLanguageIds: ['html'],
    participantsKey: 'htmlLanguageParticipants',
  },
  {
    extensionId: 'vscode.json-language-features',
    baseLanguageIds: ['json', 'jsonc', 'snippets'],
    participantsKey: 'jsonLanguageParticipants',
  },
];

/**
 * 语言 id → 会在该语言里提供颜色的内置扩展 id。
 *
 * 入参是所有已安装扩展的 `packageJSON`; 形状不可信, 因此逐层做类型判断。
 * 同一个语言被基础集合与参与者同时声明时以基础集合为准 —— 这份映射只用来决定
 * "要不要探测"与"探测到的空结果能不能缓存", 两个扩展的就绪时机没有实质差别。
 */
export function builtInColorLanguages(
  packageJsons: Iterable<unknown>,
): ReadonlyMap<string, string> {
  const byLanguage = new Map<string, string>();
  for (const provider of BUILT_IN_COLOR_PROVIDERS) {
    for (const languageId of provider.baseLanguageIds) {
      byLanguage.set(languageId, provider.extensionId);
    }
  }

  const withParticipants = BUILT_IN_COLOR_PROVIDERS.filter((provider) => provider.participantsKey);
  for (const packageJson of packageJsons) {
    const contributes = (packageJson as { contributes?: Record<string, unknown> } | undefined)
      ?.contributes;
    if (typeof contributes !== 'object' || contributes === null) continue;
    for (const provider of withParticipants) {
      const participants = contributes[provider.participantsKey as string];
      if (!Array.isArray(participants)) continue;
      for (const participant of participants) {
        const languageId = (participant as { languageId?: unknown } | undefined)?.languageId;
        if (typeof languageId !== 'string' || languageId === '') continue;
        if (!byLanguage.has(languageId)) byLanguage.set(languageId, provider.extensionId);
      }
    }
  }
  return byLanguage;
}

/** 成对出现才算引号; 单引号在 JSON 里不合法, 但 JSONC 之外的方言与 schema 参与者可能允许。 */
const QUOTES = new Set(['"', "'", '`']);

/**
 * 其他提供器上报的一个 range 对应哪些覆盖键。
 *
 * 通常只有它自己, 但内置 JSON 提供器给出的是**整个字符串节点**的 range (包含两侧引号),
 * 而本扩展给出的是引号内部的颜色本身。只按精确 range 比对时两边永远对不上, 于是
 * `"#ff8800"` 在主题文件里得到两个色块。因此带引号的 range 额外产出一个"引号内部"的键。
 *
 * 反过来不做: 不会因为别人报了 `#ff8800` 就把本扩展的 `"#ff8800"` 也算成被覆盖 ——
 * 本扩展根本不会上报带引号的 range。
 */
export function coverageKeys(text: string, range: ColorRange): string[] {
  const keys = [rangeKey(range)];
  const first = text[range.start];
  const last = text[range.end - 1];
  if (range.end - range.start >= 2 && first !== undefined && first === last && QUOTES.has(first)) {
    keys.push(rangeKey({ start: range.start + 1, end: range.end - 1 }));
  }
  return keys;
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
 * - 其他提供器**还没就绪** (本扩展是 `onStartupFinished`, 内置语言服务是 `onLanguage:*`,
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

/** 外层在前, 其嵌套紧随; 嵌套本身已是扁平的全部后代。 */
function* flatten(matches: readonly ColorMatch[]): Generator<ColorMatch> {
  for (const match of matches) {
    yield match;
    for (const nested of match.nested ?? []) yield nested;
  }
}

export function planSwatches(
  matches: readonly ColorMatch[],
  options: SwatchPlanOptions,
): SwatchPlan {
  const kept: ColorMatch[] = [];
  const seen = new Set<number>();
  let dropped = 0;

  for (const match of flatten(matches)) {
    if (!options.allows(match.syntax)) continue;
    if (!options.hasPreview(match)) continue;

    // 去重按**起点**: 色块画在 range 起点之前, 同起点必然叠在一起, 起点不同则天然错开。
    // 这让 `var(--x, #def)` 的外层与内层各得一个色块。
    if (seen.has(match.range.start)) continue;
    // 覆盖判定仍按精确 range: `covered` 来自其他提供器上报的区间, 换成起点会把
    // "别人覆盖了同起点的另一段" 误判成 "本段已被覆盖"。
    if (options.covered?.has(rangeKey(match.range))) continue;
    seen.add(match.range.start);

    if (kept.length >= options.limit) {
      dropped += 1;
      continue;
    }
    kept.push(match);
  }

  return { matches: kept, dropped };
}
