/**
 * 语言过滤。
 *
 * 语义:
 * - 元素为 language id、`*` 通配, 或 `!` 前缀的排除项;
 * - 先判断排除项, 命中即禁用; 再判断包含项;
 * - 排除项优先级高于包含项, 与数组顺序无关;
 * - 空数组表示不启用任何语言。
 *
 * 旧 `color-highlight.languages` 只支持包含项, 迁移时原样复制即可。
 */

export interface LanguageFilter {
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly includesAll: boolean;
}

export function parseLanguageFilter(patterns: readonly string[]): LanguageFilter {
  const includes: string[] = [];
  const excludes: string[] = [];
  let includesAll = false;

  for (const raw of patterns) {
    const pattern = raw.trim();
    if (pattern.length === 0) continue;
    if (pattern.startsWith('!')) {
      excludes.push(pattern.slice(1).toLowerCase());
      continue;
    }
    if (pattern === '*') {
      includesAll = true;
      continue;
    }
    includes.push(pattern.toLowerCase());
  }

  return { includes, excludes, includesAll };
}

export function languageMatches(filter: LanguageFilter, languageId: string): boolean {
  const id = languageId.toLowerCase();
  if (filter.excludes.includes(id)) return false;
  if (filter.excludes.includes('*')) return false;
  if (filter.includesAll) return true;
  return filter.includes.includes(id);
}

export function isLanguageEnabled(patterns: readonly string[], languageId: string): boolean {
  return languageMatches(parseLanguageFilter(patterns), languageId);
}
