/**
 * 文档变更合并窗口。
 *
 * 每个 key 只保留一个待执行任务, 窗口内的重复变更被合并;
 * `cancel()` 用于文档关闭或扩展 dispose 时立刻停止。
 */

export const DEFAULT_COALESCE_WINDOW_MS = 120;

export class ChangeCoalescer {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly windowMs: number = DEFAULT_COALESCE_WINDOW_MS) {}

  schedule(key: string, run: () => void): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      run();
    }, this.windowMs);
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const existing = this.timers.get(key);
    if (!existing) return;
    clearTimeout(existing);
    this.timers.delete(key);
  }

  pending(key: string): boolean {
    return this.timers.has(key);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
