/**
 * 单个文档的颜色索引。
 *
 * 保证:
 * - 同一 `(documentVersion, configDigest, variableContextVersion)` 只扫描一次;
 * - 旧版本的扫描结果不会被写入 (`accept()` 会拒绝过期结果);
 * - 高亮、Hover 与转换消费同一份 match 列表, 因此三者结论必然一致。
 *
 * 本层不引用 vscode API, 便于在单元测试中直接驱动。
 */
import type { VariableContext } from '../adapters/types.js';
import { findMatchAtOffset, scanText, type ScanOptions } from '../core/scanner.js';
import type { ColorMatch } from '../core/types.js';

import { patchVariableMatches } from './variable-patch.js';

/** 与 `advanced.variables.maxResolveDepth` 的默认值一致。 */
const DEFAULT_MAX_RESOLVE_DEPTH = 20;

/**
 * 变量解析的输入。
 *
 * 做成对象而不是裸 `VariableContext`: 补丁还需要 `maxResolveDepth`, 而它是解析层参数,
 * 不该塞进 `ScanOptions` 污染核心扫描选项。
 */
export interface VariableResolutionInput {
  readonly context: VariableContext;
  readonly maxResolveDepth: number;
}

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
  ensure(
    text: string,
    parts: IndexKeyParts,
    options: ScanOptions,
    variables?: VariableResolutionInput,
  ): IndexSnapshot {
    if (this.isFresh(parts)) return this.snapshot as IndexSnapshot;
    const result = scanText(text, options);
    this.scanCount += 1;
    const snapshot: IndexSnapshot = {
      ...parts,
      // 变量引用在这里被解析或整条移除; 不传上下文即全部移除 (静默)。
      matches: patchVariableMatches(result.matches, variables?.context, {
        parseOptions: options,
        maxResolveDepth: variables?.maxResolveDepth ?? DEFAULT_MAX_RESOLVE_DEPTH,
      }),
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

  findAtOffset(offset: number): ColorMatch | undefined {
    if (!this.snapshot) return undefined;
    return findMatchAtOffset(this.snapshot.matches, offset);
  }

  /** 与选区重叠的全部 match。 */
  findInRange(start: number, end: number): readonly ColorMatch[] {
    if (!this.snapshot) return [];
    return this.snapshot.matches.filter(
      (match) => match.range.start < end && start < match.range.end,
    );
  }

  invalidate(): void {
    this.snapshot = undefined;
  }
}
