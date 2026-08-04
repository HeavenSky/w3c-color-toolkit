/**
 * Output Channel 与结构化日志。
 *
 * 所有告警只写日志, 不弹通知; 需要用户决策的场景才用通知或 Quick Pick。
 * 同一 key 的告警每个 scope 只记录一次, 避免刷屏。
 */
import * as vscode from 'vscode';

import type { LogLevel } from '../configuration/load.js';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = Object.freeze({
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;
  private level: LogLevel = 'warn';
  private readonly seenOnce = new Set<string>();

  constructor(name = 'W3C Color Toolkit') {
    this.channel = vscode.window.createOutputChannel(name, { log: true });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  show(): void {
    this.channel.show(true);
  }

  private enabled(level: Exclude<LogLevel, 'off'>): boolean {
    return LEVEL_ORDER[this.level] >= LEVEL_ORDER[level];
  }

  error(message: string): void {
    if (this.enabled('error')) this.channel.error(message);
  }

  warn(message: string): void {
    if (this.enabled('warn')) this.channel.warn(message);
  }

  info(message: string): void {
    if (this.enabled('info')) this.channel.info(message);
  }

  debug(message: string): void {
    if (this.enabled('debug')) this.channel.debug(message);
  }

  /** 同一 key 只记录一次。 */
  warnOnce(key: string, message: string): void {
    if (this.seenOnce.has(key)) return;
    this.seenOnce.add(key);
    this.warn(message);
  }

  /** 配置变化后允许重新提示。 */
  resetOnce(): void {
    this.seenOnce.clear();
  }

  /** 多行报告, 例如迁移预览或生效配置。 */
  report(title: string, lines: readonly string[]): void {
    this.channel.info(`── ${title} ──`);
    for (const line of lines) this.channel.info(`  ${line}`);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
