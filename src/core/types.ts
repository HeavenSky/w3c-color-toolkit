/**
 * 跨层稳定内部契约。
 *
 * 约束:
 * - feature 层禁止直接持有 CSSTools 或 Color.js 对象, 只能使用本文件的类型。
 * - `range` 为 JavaScript UTF-16 offset, `end` 为开区间。
 * - `raw` 必须与 `document.getText(range)` 完全相等。
 * - 所有解析失败必须产生结构化 diagnostic, 不允许空 catch。
 */

/** 解析状态。是否实验语法与之正交, 见 `ColorMatch.experimental`。 */
export type ResolutionKind = 'resolved' | 'contextual' | 'invalid';

/** 语法所属规范层级。 */
export type SpecLevel = 'color-3' | 'color-4' | 'color-5' | 'color-6' | 'color-hdr-1';

export type ContextualReason =
  | 'current-color'
  | 'system-color'
  | 'deprecated-system-color'
  | 'color-scheme'
  | 'css-variable'
  | 'preprocessor-variable'
  | 'custom-color-profile'
  | 'hdr-headroom'
  | 'unsupported-experimental-context';

export type DiagnosticCode =
  | 'parse-failed'
  | 'unknown-function'
  | 'unknown-color-space'
  | 'invalid-component-count'
  | 'invalid-component-keyword'
  | 'out-of-range-component'
  | 'circular-variable'
  | 'max-depth-exceeded'
  | 'import-not-allowed'
  | 'experimental-disabled'
  | 'upstream-unsupported'
  | 'gamut-mapped'
  | 'hdr-tone-mapped'
  | 'alpha-loss'
  | 'missing-component-loss';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ColorRange {
  readonly start: number;
  readonly end: number;
}

export interface ColorDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  /** `src/l10n/strings.ts` 中的 key, 不是已渲染的句子。 */
  readonly messageKey: string;
  readonly messageArgs?: readonly (string | number)[];
  readonly range?: ColorRange;
}

/** 已解析到绝对颜色。XYZ D50 是跨 feature 的规范交换色。 */
export interface ResolvedColor {
  readonly xyzD50: readonly [number, number, number];
  readonly alpha: number;
  /** 原始色彩空间的 CSS 标识, 例如 `oklch`、`display-p3`、`rec2100-pq`。 */
  readonly originalSpace: string;
  /** 原始分量, missing component 为 `null`。 */
  readonly originalChannels: readonly (number | null)[];
  /** 原始分量中为 missing component 的下标。 */
  readonly missingComponents: readonly number[];
  /** 例如无 ICC 的 `device-cmyk()` fallback。 */
  readonly approximate: boolean;
  /** 为了在 sRGB 预览而做过 HDR 色调映射。 */
  readonly hdrToneMapped: boolean;
}

export type AssumedContext = 'light' | 'dark' | 'hdr-headroom';

export interface ContextualBranch {
  readonly label: string;
  readonly raw: string;
  readonly resolved?: ResolvedColor;
}

export interface ContextualColor {
  readonly reason: ContextualReason;
  /** 依赖的标识: 关键字、`var()` 名、profile 的 dashed-ident 等。 */
  readonly dependsOn: string;
  /** 可静态枚举的候选分支。 */
  readonly branches: readonly ContextualBranch[];
  /** deprecated 系统色的当前替代关键字。 */
  readonly replacement?: string;
  /** 只有用户显式选择了预览假设时才填充。 */
  readonly assumed?: { readonly context: AssumedContext; readonly resolved: ResolvedColor };
}

export interface ColorMatch {
  readonly raw: string;
  readonly range: ColorRange;
  /** 语法标识, 例如 `hex`、`rgb`、`color-mix`、`ictcp`、`system-color`。 */
  readonly syntax: string;
  readonly specLevel: SpecLevel;
  readonly experimental: boolean;
  readonly sourceSpace?: string;
  readonly resolution: ResolutionKind;
  readonly resolved?: ResolvedColor;
  readonly contextual?: ContextualColor;
  readonly diagnostics: readonly ColorDiagnostic[];
}

/** 色域映射策略。`css` 为规范兼容映射, `clip` 为逐通道裁剪。 */
export type GamutMapping = 'css' | 'clip' | 'none';

export type HexCase = 'lower' | 'upper';

export type RgbHslSyntax = 'modern' | 'legacy';

export type HdrToneMapping = 'none' | 'reinhard' | 'clip';

export interface SerializerOptions {
  readonly precision: number;
  readonly hexCase: HexCase;
  readonly syntax: RgbHslSyntax;
  readonly gamutMapping: GamutMapping;
  /** `none` 分量无法表达时是否按计算值输出。 */
  readonly computeMissingComponents: boolean;
}

/** 序列化结果与信息损失标记。 */
export interface SerializedColor {
  readonly text: string;
  readonly gamutMapped: boolean;
  readonly alphaLost: boolean;
  readonly missingComponentsLost: boolean;
  readonly hdrToneMapped: boolean;
}

export function createDiagnostic(
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
  messageKey: string,
  messageArgs?: readonly (string | number)[],
  range?: ColorRange,
): ColorDiagnostic {
  return { code, severity, messageKey, messageArgs, range };
}

export function rangeLength(range: ColorRange): number {
  return range.end - range.start;
}

export function rangesOverlap(a: ColorRange, b: ColorRange): boolean {
  return a.start < b.end && b.start < a.end;
}
