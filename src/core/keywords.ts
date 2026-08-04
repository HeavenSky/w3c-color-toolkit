/**
 * 关键字白名单与查表入口。
 *
 * 命名颜色表在 `keywords.named.ts` 中生成, 本文件只做转发与其余清单的声明,
 * 使 `keywords.ts` 保持为扫描器与测试的唯一入口。
 */
import { NAMED_COLOR_COUNT, NAMED_COLORS, type Rgb8 } from './keywords.named.js';

export { NAMED_COLOR_COUNT, NAMED_COLORS };
export type { Rgb8 };

/** CSS Color 4 §6.2 当前系统色, 保留规范给出的大小写形式。 */
export const SYSTEM_COLORS: readonly string[] = Object.freeze([
  'AccentColor',
  'AccentColorText',
  'ActiveText',
  'ButtonBorder',
  'ButtonFace',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'Mark',
  'MarkText',
  'SelectedItem',
  'SelectedItemText',
  'VisitedText',
]);

/** CSS Color 4 附录 A 的 deprecated 系统色到当前替代关键字的映射。 */
export const DEPRECATED_SYSTEM_COLORS: Readonly<Record<string, string>> = Object.freeze({
  ActiveBorder: 'ButtonBorder',
  ActiveCaption: 'Canvas',
  AppWorkspace: 'Canvas',
  Background: 'Canvas',
  ButtonHighlight: 'ButtonFace',
  ButtonShadow: 'ButtonFace',
  CaptionText: 'CanvasText',
  InactiveBorder: 'ButtonBorder',
  InactiveCaption: 'Canvas',
  InactiveCaptionText: 'GrayText',
  InfoBackground: 'Canvas',
  InfoText: 'CanvasText',
  Menu: 'Canvas',
  MenuText: 'CanvasText',
  Scrollbar: 'Canvas',
  ThreeDDarkShadow: 'ButtonBorder',
  ThreeDFace: 'ButtonFace',
  ThreeDHighlight: 'ButtonBorder',
  ThreeDLightShadow: 'ButtonBorder',
  ThreeDShadow: 'ButtonBorder',
  Window: 'Canvas',
  WindowFrame: 'ButtonBorder',
  WindowText: 'CanvasText',
});

/** CSS Color 4 颜色函数。 */
export const COLOR4_FUNCTIONS: readonly string[] = Object.freeze([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
]);

/** CSS Color 5 新增函数。 */
export const COLOR5_FUNCTIONS: readonly string[] = Object.freeze([
  'color-mix',
  'contrast-color',
  'device-cmyk',
  'light-dark',
  'alpha',
]);

/** CSS Color 6 新增函数, 默认关闭。 */
export const COLOR6_FUNCTIONS: readonly string[] = Object.freeze(['color-layers']);

/** CSS Color 6 对比度关键字与函数。 */
export const COLOR6_TARGET_CONTRAST_KEYWORDS: readonly string[] = Object.freeze(['wcag2']);
export const COLOR6_WCAG2_LEVELS: readonly string[] = Object.freeze(['aa', 'aaa', 'large']);
export const COLOR6_BASE_ROLE_KEYWORDS: readonly string[] = Object.freeze(['tbd-fg', 'tbd-bg']);

/**
 * CSS Color HDR 1 新增函数, 默认关闭。
 * `hdr-color()` 的产生式正文在 2026-07-28 草案中写作 `color-hdr()`,
 * 两个名字都识别, 采用的名字记录在 diagnostic 中。
 */
export const HDR_FUNCTIONS: readonly string[] = Object.freeze([
  'ictcp',
  'jzazbz',
  'jzczhz',
  'hdr-color',
  'color-hdr',
]);

/** `dynamic-range-limit` 属性及其值, 只用于排除误报。 */
export const DYNAMIC_RANGE_LIMIT_PROPERTY = 'dynamic-range-limit';
export const DYNAMIC_RANGE_LIMIT_KEYWORDS: readonly string[] = Object.freeze([
  'standard',
  'no-limit',
  'constrained',
]);
export const DYNAMIC_RANGE_LIMIT_FUNCTIONS: readonly string[] = Object.freeze([
  'dynamic-range-limit-mix',
]);

/** `color()` 的 CSS Color 4 预定义空间关键字。 */
export const COLOR4_COLOR_SPACES: readonly string[] = Object.freeze([
  'srgb',
  'srgb-linear',
  'display-p3',
  'display-p3-linear',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz',
  'xyz-d50',
  'xyz-d65',
]);

/** `color()` 的 CSS Color HDR 1 空间关键字, 默认关闭。 */
export const HDR_COLOR_SPACES: readonly string[] = Object.freeze([
  'rec2100-pq',
  'rec2100-hlg',
  'rec2100-linear',
]);

/** 与上下文相关的裸关键字。 */
export const CONTEXTUAL_KEYWORDS: readonly string[] = Object.freeze(['currentcolor']);

/** `transparent` 单独处理: 它是可解析的绝对颜色。 */
export const TRANSPARENT_KEYWORD = 'transparent';

const namedLookup = new Map<string, Rgb8>(
  Object.entries(NAMED_COLORS).map(([name, rgb]) => [name, rgb]),
);
const systemLookup = new Map<string, string>(SYSTEM_COLORS.map((name) => [name.toLowerCase(), name]));
const deprecatedLookup = new Map<string, { canonical: string; replacement: string }>(
  Object.entries(DEPRECATED_SYSTEM_COLORS).map(([name, replacement]) => [
    name.toLowerCase(),
    { canonical: name, replacement },
  ]),
);

/** 按 ASCII 大小写不敏感查找命名颜色。 */
export function lookupNamedColor(ident: string): Rgb8 | undefined {
  return namedLookup.get(ident.toLowerCase());
}

/** 按 ASCII 大小写不敏感查找当前系统色, 返回规范大小写形式。 */
export function lookupSystemColor(ident: string): string | undefined {
  return systemLookup.get(ident.toLowerCase());
}

/** 按 ASCII 大小写不敏感查找 deprecated 系统色。 */
export function lookupDeprecatedSystemColor(
  ident: string,
): { canonical: string; replacement: string } | undefined {
  return deprecatedLookup.get(ident.toLowerCase());
}

const color4Functions = new Set(COLOR4_FUNCTIONS);
const color5Functions = new Set(COLOR5_FUNCTIONS);
const color6Functions = new Set(COLOR6_FUNCTIONS);
const hdrFunctions = new Set(HDR_FUNCTIONS);
const dynamicRangeLimitFunctions = new Set(DYNAMIC_RANGE_LIMIT_FUNCTIONS);

export interface FunctionWhitelistOptions {
  readonly cssColor6: boolean;
  readonly cssColorHdr: boolean;
}

/**
 * 构造函数名白名单。
 * 实验语法在开关关闭时不进入白名单, 由调用方单独识别以产生 `experimental-disabled`。
 */
export function functionWhitelist(options: FunctionWhitelistOptions): ReadonlySet<string> {
  const names = new Set<string>([...color4Functions, ...color5Functions]);
  if (options.cssColor6) {
    for (const name of color6Functions) names.add(name);
  }
  if (options.cssColorHdr) {
    for (const name of hdrFunctions) names.add(name);
  }
  return names;
}

/** 关闭开关时用于识别"这是实验语法"而不是"未知函数"。 */
export function isExperimentalFunction(name: string): boolean {
  const lower = name.toLowerCase();
  return color6Functions.has(lower) || hdrFunctions.has(lower);
}

export function isDynamicRangeLimitFunction(name: string): boolean {
  return dynamicRangeLimitFunctions.has(name.toLowerCase());
}

const color4Spaces = new Set(COLOR4_COLOR_SPACES);
const hdrSpaces = new Set(HDR_COLOR_SPACES);

export function isColor4Space(ident: string): boolean {
  return color4Spaces.has(ident.toLowerCase());
}

export function isHdrSpace(ident: string): boolean {
  return hdrSpaces.has(ident.toLowerCase());
}

/** `color(--name ...)` 的自定义空间引用。 */
export function isCustomColorSpace(ident: string): boolean {
  return ident.startsWith('--');
}
