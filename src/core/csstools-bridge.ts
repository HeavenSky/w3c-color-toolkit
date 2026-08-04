/**
 * CSSTools 桥接层。
 *
 * 负责: token 化、component value 树、以及把 CSSTools 的 `ColorData` 翻译为 `ResolvedColor`。
 *
 * 2026-08-04 实测 (`scripts/probe-upstream.mjs`, @csstools/css-color-parser 4.1.10):
 * - 支持: CSS Color 4 全部函数与 `color()` 空间、legacy 逗号语法、`none`、
 *   `color-mix()` 两色与多色 (`color-mix-variadic`)、hue 插值、相对颜色 + `calc()`、
 *   `alpha()` (`relative-alpha-syntax`)、`contrast-color()` (带 `experimental` 标记)。
 * - 不支持: `device-cmyk()`、`light-dark()`、`currentColor`、系统色、`color(--profile ...)`、
 *   CSS Color 6 的 `wcag2`/`wcag2()`/`color-layers()`、CSS Color HDR 的全部函数与 `rec2100-*`。
 * 不支持的语法由本项目自有解析器补齐, 不静默降级为 invalid。
 */
import {
  color as parseColorData,
  ColorNotation,
  SyntaxFlag,
  type ColorData,
} from '@csstools/css-color-parser';
import {
  isFunctionNode,
  isTokenNode,
  isWhiteSpaceOrCommentNode,
  parseComponentValue,
  parseListOfComponentValues,
  sourceIndices,
  type ComponentValue,
} from '@csstools/css-parser-algorithms';
import {
  isTokenComma,
  isTokenDelim,
  isTokenDimension,
  isTokenIdent,
  isTokenNumber,
  isTokenPercentage,
  tokenize,
  type CSSToken,
} from '@csstools/css-tokenizer';

import { buildResolved, isKnownCssSpace } from './colorjs-bridge.js';
import type { ResolvedColor, SpecLevel } from './types.js';

export { isFunctionNode, isTokenNode };
export type { ComponentValue };

export function tokenizeCss(css: string): CSSToken[] {
  return tokenize({ css });
}

export function parseSingleComponentValue(css: string): ComponentValue | undefined {
  const value = parseComponentValue(tokenizeCss(css));
  return value ?? undefined;
}

export function parseComponentValues(css: string): ComponentValue[] {
  return parseListOfComponentValues(tokenizeCss(css));
}

/**
 * 节点在源码中的 `[start, endInclusive]`。
 * CSSTools 的 `sourceIndices()` 返回闭区间, 调用方需要自行 +1 转成开区间。
 */
export function nodeSourceIndices(node: ComponentValue): [number, number] | undefined {
  try {
    return sourceIndices(node);
  } catch {
    // 极少数节点没有 token (例如空 block), 交给调用方跳过。
    return undefined;
  }
}

/** CSSTools 的 notation → CSS 空间关键字。两者基本一致, 但 `hex`/`rgb` 都落到 sRGB。 */
function notationToCssSpace(notation: ColorNotation): string {
  switch (notation) {
    case ColorNotation.HEX:
    case ColorNotation.RGB:
      return 'srgb';
    case ColorNotation.sRGB:
      return 'srgb';
    case ColorNotation.Linear_sRGB:
      return 'srgb-linear';
    case ColorNotation.Display_P3:
      return 'display-p3';
    case ColorNotation.Linear_Display_P3:
      return 'display-p3-linear';
    case ColorNotation.A98_RGB:
      return 'a98-rgb';
    case ColorNotation.ProPhoto_RGB:
      return 'prophoto-rgb';
    case ColorNotation.Rec2020:
      return 'rec2020';
    case ColorNotation.XYZ_D50:
      return 'xyz-d50';
    case ColorNotation.XYZ_D65:
      return 'xyz-d65';
    case ColorNotation.HSL:
      return 'hsl';
    case ColorNotation.HWB:
      return 'hwb';
    case ColorNotation.Lab:
      return 'lab';
    case ColorNotation.LCH:
      return 'lch';
    case ColorNotation.OKLab:
      return 'oklab';
    case ColorNotation.OKLCH:
      return 'oklch';
    default:
      return 'srgb';
  }
}

/**
 * CSSTools 的 RGB 类通道是 0-1, HSL/HWB 的第一个通道是角度、后两个是 0-100,
 * Lab/LCH 的 L 是 0-100。这些与 Color.js 的同名空间刻度一致, 无需再缩放。
 * 唯一需要处理的是 `none` 以 NaN 表达。
 */
function channelsFromColorData(data: ColorData): number[] {
  return [data.channels[0], data.channels[1], data.channels[2]];
}

function alphaFromColorData(data: ColorData): number | undefined {
  return typeof data.alpha === 'number' ? data.alpha : undefined;
}

export interface CssToolsParseResult {
  readonly resolved: ResolvedColor;
  readonly syntax: string;
  readonly specLevel: SpecLevel;
  readonly experimental: boolean;
  readonly sourceSpace: string;
  readonly flags: ReadonlySet<string>;
  /** alpha 是 `var()` 等非静态值时为 true, 调用方应降级为 contextual。 */
  readonly nonStaticAlpha: boolean;
}

function syntaxFromFlags(data: ColorData): { syntax: string; specLevel: SpecLevel } {
  const flags = data.syntaxFlags;
  if (flags.has(SyntaxFlag.ColorMix)) {
    return { syntax: flags.has(SyntaxFlag.ColorMixVariadic) ? 'color-mix-variadic' : 'color-mix', specLevel: 'color-5' };
  }
  if (flags.has(SyntaxFlag.RelativeAlphaSyntax)) return { syntax: 'alpha', specLevel: 'color-5' };
  if (flags.has(SyntaxFlag.RelativeColorSyntax)) {
    return { syntax: `relative-${notationToCssSpace(data.colorNotation)}`, specLevel: 'color-5' };
  }
  if (flags.has(SyntaxFlag.ContrastColor)) return { syntax: 'contrast-color', specLevel: 'color-5' };
  if (flags.has(SyntaxFlag.Hex)) return { syntax: 'hex', specLevel: 'color-4' };
  if (flags.has(SyntaxFlag.NamedColor)) return { syntax: 'named-color', specLevel: 'color-4' };
  if (flags.has(SyntaxFlag.LegacyRGB)) return { syntax: 'legacy-rgb', specLevel: 'color-3' };
  if (flags.has(SyntaxFlag.LegacyHSL)) return { syntax: 'legacy-hsl', specLevel: 'color-3' };
  const space = notationToCssSpace(data.colorNotation);
  const isColorFunction =
    data.colorNotation !== ColorNotation.RGB &&
    data.colorNotation !== ColorNotation.HSL &&
    data.colorNotation !== ColorNotation.HWB &&
    data.colorNotation !== ColorNotation.Lab &&
    data.colorNotation !== ColorNotation.LCH &&
    data.colorNotation !== ColorNotation.OKLab &&
    data.colorNotation !== ColorNotation.OKLCH;
  return { syntax: isColorFunction ? `color-${space}` : space, specLevel: 'color-4' };
}

/**
 * 用 CSSTools 解析一个 component value。
 * 返回 `undefined` 表示 CSSTools 不认识该语法, 调用方继续尝试自有解析器。
 */
export function parseWithCssTools(node: ComponentValue): CssToolsParseResult | undefined {
  const data = parseColorData(node);
  if (data === false) return undefined;

  const cssSpace = notationToCssSpace(data.colorNotation);
  if (!isKnownCssSpace(cssSpace)) return undefined;

  const alpha = alphaFromColorData(data);
  const { syntax, specLevel } = syntaxFromFlags(data);
  const resolved = buildResolved({
    cssSpace,
    channels: channelsFromColorData(data),
    alpha: alpha ?? 1,
  });

  return {
    resolved,
    syntax,
    specLevel,
    experimental: data.syntaxFlags.has(SyntaxFlag.Experimental),
    sourceSpace: cssSpace,
    flags: new Set([...data.syntaxFlags].map(String)),
    nonStaticAlpha: alpha === undefined,
  };
}

export { ColorNotation, SyntaxFlag };

// ---------------------------------------------------------------------------
// component value 读取helpers
//
// 自有解析器 (HDR、Color 6、device-cmyk、light-dark、自定义 profile) 需要在
// component value 树上读取分量。这些 helper 集中在桥接层, 使 CSSTools 的类型
// 不泄漏到 core 的其余模块。
// ---------------------------------------------------------------------------

/** 取函数名的小写形式; 不是函数节点时返回 undefined。 */
export function functionName(node: ComponentValue): string | undefined {
  if (!isFunctionNode(node)) return undefined;
  const raw = node.getName();
  return raw.toLowerCase();
}

function isWhitespaceOrComment(node: ComponentValue): boolean {
  return isWhiteSpaceOrCommentNode(node);
}

function isCommaToken(node: ComponentValue): boolean {
  return isTokenNode(node) && isTokenComma(node.value);
}

function isSlashDelim(node: ComponentValue): boolean {
  return isTokenNode(node) && isTokenDelim(node.value) && node.value[4].value === '/';
}

/** 函数实参: 先按 `/` 分出 alpha, 再按逗号或空白切分主体。 */
export interface FunctionArguments {
  /** 主体分量组, 逗号分隔时每组一个元素, 空白分隔时同样每组一个元素。 */
  readonly groups: readonly (readonly ComponentValue[])[];
  /** `/` 之后的 alpha 分量, 不存在时为空数组。 */
  readonly alpha: readonly ComponentValue[];
  readonly hasComma: boolean;
}

export function splitFunctionArguments(node: ComponentValue): FunctionArguments {
  if (!isFunctionNode(node)) return { groups: [], alpha: [], hasComma: false };
  const significant = node.value.filter((child) => !isWhitespaceOrComment(child));

  const slashIndex = significant.findIndex(isSlashDelim);
  const body = slashIndex >= 0 ? significant.slice(0, slashIndex) : significant;
  const alpha = slashIndex >= 0 ? significant.slice(slashIndex + 1) : [];

  const hasComma = body.some(isCommaToken);
  const groups: ComponentValue[][] = [];
  let current: ComponentValue[] = [];
  for (const child of body) {
    if (isCommaToken(child)) {
      groups.push(current);
      current = [];
      continue;
    }
    if (hasComma) {
      current.push(child);
    } else {
      groups.push([child]);
    }
  }
  if (hasComma) groups.push(current);

  return { groups, alpha, hasComma };
}

export type NumericValue = { readonly kind: 'number'; readonly value: number } | { readonly kind: 'percentage'; readonly value: number } | { readonly kind: 'angle'; readonly degrees: number } | { readonly kind: 'none' } | { readonly kind: 'ident'; readonly ident: string } | { readonly kind: 'unsupported' };

const ANGLE_TO_DEGREES: Readonly<Record<string, number>> = Object.freeze({
  deg: 1,
  grad: 360 / 400,
  rad: 180 / Math.PI,
  turn: 360,
});

/** 读取单个 token 分量。不做单位换算之外的语义解释。 */
export function readNumeric(node: ComponentValue | undefined): NumericValue {
  if (!node || !isTokenNode(node)) return { kind: 'unsupported' };
  const token = node.value;
  if (isTokenNumber(token)) return { kind: 'number', value: token[4].value };
  if (isTokenPercentage(token)) return { kind: 'percentage', value: token[4].value };
  if (isTokenDimension(token)) {
    const factor = ANGLE_TO_DEGREES[token[4].unit.toLowerCase()];
    if (factor === undefined) return { kind: 'unsupported' };
    return { kind: 'angle', degrees: token[4].value * factor };
  }
  if (isTokenIdent(token)) {
    const ident = token[4].value;
    if (ident.toLowerCase() === 'none') return { kind: 'none' };
    return { kind: 'ident', ident };
  }
  return { kind: 'unsupported' };
}

/**
 * 读取一个数值分量, 百分比按 `percentReference` 归一。
 * 返回 `NaN` 表示 `none` (missing component), `undefined` 表示无法解析。
 */
export function readChannel(
  group: readonly ComponentValue[] | undefined,
  percentReference: number,
): number | undefined {
  if (!group || group.length !== 1) return undefined;
  const numeric = readNumeric(group[0]);
  switch (numeric.kind) {
    case 'number':
      return numeric.value;
    case 'percentage':
      return (numeric.value / 100) * percentReference;
    case 'none':
      return Number.NaN;
    default:
      return undefined;
  }
}

/** 读取 hue 分量, 支持 `<number>`、`deg/grad/rad/turn` 与 `none`。 */
export function readHue(group: readonly ComponentValue[] | undefined): number | undefined {
  if (!group || group.length !== 1) return undefined;
  const numeric = readNumeric(group[0]);
  switch (numeric.kind) {
    case 'number':
      return numeric.value;
    case 'angle':
      return numeric.degrees;
    case 'none':
      return Number.NaN;
    default:
      return undefined;
  }
}

/** 读取 alpha, 百分比按 0-1 归一; 缺省返回 1。 */
export function readAlpha(group: readonly ComponentValue[]): number | undefined {
  if (group.length === 0) return 1;
  if (group.length !== 1) return undefined;
  const numeric = readNumeric(group[0]);
  switch (numeric.kind) {
    case 'number':
      return clampAlpha(numeric.value);
    case 'percentage':
      return clampAlpha(numeric.value / 100);
    case 'none':
      return Number.NaN;
    default:
      return undefined;
  }
}

function clampAlpha(value: number): number {
  if (Number.isNaN(value)) return value;
  return Math.min(1, Math.max(0, value));
}

/** 读取一个 ident 分量, 例如 `color()` 的空间关键字或 `wcag2`。 */
export function readIdent(group: readonly ComponentValue[] | undefined): string | undefined {
  if (!group || group.length !== 1) return undefined;
  const numeric = readNumeric(group[0]);
  if (numeric.kind === 'ident') return numeric.ident;
  if (numeric.kind === 'none') return 'none';
  return undefined;
}

/** 判断某个分组是否是 `from` 关键字。 */
export function isFromKeyword(group: readonly ComponentValue[] | undefined): boolean {
  const ident = readIdent(group);
  return ident?.toLowerCase() === 'from';
}
