/**
 * 运行时字符串的 key 集中声明。
 *
 * 规则:
 * - feature 层禁止内联硬编码用户可见文案, 一律经过本文件的 key;
 * - core 层只产生 `messageKey`, 渲染发生在这里, 保证 core 无本地化依赖;
 * - 颜色语法、颜色关键字、色彩空间名、配置键与命令 id 不本地化;
 * - 数字不做 locale 化, 统一使用 `.` 小数点, 避免生成非法 CSS。
 */
import * as vscode from 'vscode';

import type { ColorDiagnostic, ContextualReason, SpecLevel } from '../core/types.js';

import { RUNTIME_STRINGS, type RuntimeStringKey } from './runtime-strings.js';

export { RUNTIME_STRINGS };
export type { RuntimeStringKey };


/**
 * 渲染一个运行时字符串。
 * 中文 bundle 缺失条目时 `vscode.l10n.t` 自动回退到英语默认文案。
 */
export function t(key: RuntimeStringKey, ...args: readonly (string | number)[]): string {
  const template = RUNTIME_STRINGS[key];
  return vscode.l10n.t(template, ...(args as (string | number)[]));
}

/** 渲染 core 产生的 diagnostic。 */
export function renderDiagnostic(diagnostic: ColorDiagnostic): string {
  const key = diagnostic.messageKey as RuntimeStringKey;
  if (!(key in RUNTIME_STRINGS)) return diagnostic.code;
  return t(key, ...(diagnostic.messageArgs ?? []));
}

export function renderContextualReason(
  reason: ContextualReason,
  ...args: readonly (string | number)[]
): string {
  return t(`reason.${reason}` as RuntimeStringKey, ...args);
}

export function renderSpecLevel(level: SpecLevel): string {
  return t(`spec.${level}` as RuntimeStringKey);
}
