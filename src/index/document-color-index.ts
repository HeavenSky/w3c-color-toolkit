/**
 * 单个文档的颜色索引。
 *
 * 保证:
 * - 同一 `(documentVersion, configDigest, variableContextVersion)` 只扫描一次;
 * - 旧版本的扫描结果不会被写入 (`accept()` 会拒绝过期结果);
 * - 高亮、Hover 与转换消费同一份 match 列表, 因此三者结论必然一致;
 * - 变量在扫描期同步解析 (取值回调由 `ScanOptions.resolveVariable` 注入), 因此索引层
 *   不再有"先产出占位、再异步补丁"的第二阶段。
 *
 * 本层不引用 vscode API, 便于在单元测试中直接驱动。
 */
import { findMatchAtOffset, scanText, type ScanOptions } from '../core/scanner.js';
import type { ColorMatch } from '../core/types.js';

export interface IndexKeyParts {
  readonly documentVersion: number;
  readonly configDigest: string;
  readonly variableContextVersion: number;
}

export interface IndexSnapshot extends IndexKeyParts {
  readonly matches: readonly ColorMatch[];
  readonly truncated: boolean;
}

export class DocumentColorIndex {
  private snapshot: IndexSnapshot | undefined;
  private scanCount = 0;

  get current(): IndexSnapshot | undefined {
    return this.snapshot;
  }

  /** 供测试断言"同一版本只扫描一次"。 */
  get scans(): number {
    return this.scanCount;
  }

  /** 只比较文档版本, 供 Hover 判断"索引已是最新且确实没有命中"。 */
  isFreshFor(documentVersion: number): boolean {
    return this.snapshot?.documentVersion === documentVersion;
  }

  isFresh(parts: IndexKeyParts): boolean {
    const snapshot = this.snapshot;
    if (!snapshot) return false;
    return (
      snapshot.documentVersion === parts.documentVersion &&
      snapshot.configDigest === parts.configDigest &&
      snapshot.variableContextVersion === parts.variableContextVersion
    );
  }

  /**
   * 按需扫描。已是最新时直接返回缓存, 不重复扫描。
   */
  ensure(text: string, parts: IndexKeyParts, options: ScanOptions): IndexSnapshot {
    if (this.isFresh(parts)) return this.snapshot as IndexSnapshot;
    // 变量在扫描期就地解析 (`options.resolveVariable`), 因此这里没有第二阶段补丁。
    const result = scanText(text, options);
    this.scanCount += 1;
    const snapshot: IndexSnapshot = {
      ...parts,
      matches: result.matches,
      truncated: result.truncated,
    };
    this.snapshot = snapshot;
    return snapshot;
  }

  /**
   * 提交一份异步扫描结果。
   * 版本比当前缓存旧时拒绝写入, 返回 false。
   */
  accept(snapshot: IndexSnapshot): boolean {
    const current = this.snapshot;
    if (current && snapshot.documentVersion < current.documentVersion) return false;
    this.snapshot = snapshot;
    return true;
  }

  /**
   * 取该 offset 处**最内层**的 match。
   *
   * 主列表仍然互不重叠, 因此先走二分定位顶层项 (`findMatchAtOffset` 的前提不变);
   * 命中项若带嵌套, 再在其中线性挑出范围最短的那个。
   *
   * 必须取最内层而不是外层: 取色器的 `provideColorPresentations` 拿到的是**内层色块**的
   * range, 再用它反查 match; 若返回外层, 取色器给出的候选写法与要改的目标就不是同一段文本,
   * 写回即改错位置。
   */
  findAtOffset(offset: number): ColorMatch | undefined {
    if (!this.snapshot) return undefined;
    const outer = findMatchAtOffset(this.snapshot.matches, offset);
    if (!outer?.nested) return outer;

    let innermost = outer;
    for (const nested of outer.nested) {
      if (nested.range.start > offset || offset >= nested.range.end) continue;
      if (nested.range.end - nested.range.start < innermost.range.end - innermost.range.start) {
        innermost = nested;
      }
    }
    return innermost;
  }

  /** 与选区重叠的全部 match, 含嵌套 (转换命令要靠精确 range 匹配挑出内层)。 */
  findInRange(start: number, end: number): readonly ColorMatch[] {
    if (!this.snapshot) return [];
    const overlaps = (match: ColorMatch): boolean =>
      match.range.start < end && start < match.range.end;

    const out: ColorMatch[] = [];
    for (const match of this.snapshot.matches) {
      if (!overlaps(match)) continue;
      out.push(match);
      for (const nested of match.nested ?? []) {
        if (overlaps(nested)) out.push(nested);
      }
    }
    return out;
  }

  invalidate(): void {
    this.snapshot = undefined;
  }
}
