/**
 * 隐身判定: 文件是否落在"本扩展完全不介入"的范围内。
 *
 * 三个条件是**或**关系, 任一成立即隐身; 求值顺序固定为 大小 → 文件名 → language id,
 * 既让最便宜的判据先算, 也让同时命中多个条件时上报的原因是确定的。
 *
 * 本文件不 import vscode: 判定要能在 vitest 里直接测 (测试不加载 vscode 运行时),
 * 取 basename 与文档长度这两件与宿主相关的事留给 `disable-gate.ts`。
 */
import { compilePatterns, matchesPatterns } from './gitignore-match.js';

/** 1 MB 的换算基数; 与编辑器生态惯例一致, 不用十进制的 1000000。 */
export const BYTES_PER_MB = 1048576;

export type DisableReason = 'file-size' | 'file-name' | 'language-id';

export interface DisableInput {
  /** 文件名, 不含目录。 */
  readonly baseName: string;
  readonly languageId: string;
  /** 文档长度, 按 UTF-16 码元计。 */
  readonly length: number;
}

export interface DisableRules {
  /** 单位 MB, 允许小数; `0` 与任何非正值表示不限制。 */
  readonly maxFileSizeMb: number;
  readonly fileNames: readonly string[];
  readonly languageIds: readonly string[];
}

/**
 * 是否超过大小阈值。
 *
 * 用 `!(max > 0)` 而不是 `max <= 0` 判"不限制": 前者顺带覆盖 NaN。
 * 配置层已经做过类型校验与范围钳制, 这里只是不给非法值留下崩溃的机会。
 */
function exceedsSize(length: number, maxFileSizeMb: number): boolean {
  if (!(maxFileSizeMb > 0)) return false;
  return length > maxFileSizeMb * BYTES_PER_MB;
}

export function disableReason(
  input: DisableInput,
  rules: DisableRules,
): DisableReason | undefined {
  if (exceedsSize(input.length, rules.maxFileSizeMb)) return 'file-size';
  if (matchesPatterns(compilePatterns(rules.fileNames), input.baseName)) return 'file-name';
  if (matchesPatterns(compilePatterns(rules.languageIds), input.languageId.toLowerCase())) {
    return 'language-id';
  }
  return undefined;
}

/** 两组模式里被跳过的无效模式原文, 供配置告警使用。 */
export function invalidPatterns(rules: DisableRules): readonly string[] {
  return [
    ...compilePatterns(rules.fileNames).invalid,
    ...compilePatterns(rules.languageIds).invalid,
  ];
}
