/**
 * 转换目标的唯一来源。
 *
 * 同时驱动:
 * - 二级 Quick Pick 的分类与条目;
 * - 24 个隐藏的 `w3cColorToolkit.convertTo.*` 直达命令;
 * - `package.json` 的 `contributes.commands` (由 gen-contributes 生成)。
 */
import type { TargetFormat } from '../../core/serializer.js';

export type FormatCategoryId = 'common' | 'perceptual' | 'color-function' | 'named' | 'hdr';

export interface FormatEntry {
  readonly target: TargetFormat;
  /** 命令 id 后缀, 完整 id 为 `w3cColorToolkit.convertTo.<suffix>`。 */
  readonly commandSuffix: string;
  /** Quick Pick 显示用的语法标签, 不本地化。 */
  readonly label: string;
  readonly category: FormatCategoryId;
  /** 需要 HDR 实验开关。 */
  readonly experimental: boolean;
}

export const FORMAT_CATALOG: readonly FormatEntry[] = Object.freeze([
  // 常用 (4)
  { target: 'hex', commandSuffix: 'hex', label: '#RRGGBB', category: 'common', experimental: false },
  { target: 'rgb', commandSuffix: 'rgb', label: 'rgb()', category: 'common', experimental: false },
  { target: 'hsl', commandSuffix: 'hsl', label: 'hsl()', category: 'common', experimental: false },
  { target: 'oklch', commandSuffix: 'oklch', label: 'oklch()', category: 'common', experimental: false },

  // 感知空间 (4), oklch 已在"常用"中不重复
  { target: 'hwb', commandSuffix: 'hwb', label: 'hwb()', category: 'perceptual', experimental: false },
  { target: 'lab', commandSuffix: 'lab', label: 'lab()', category: 'perceptual', experimental: false },
  { target: 'lch', commandSuffix: 'lch', label: 'lch()', category: 'perceptual', experimental: false },
  { target: 'oklab', commandSuffix: 'oklab', label: 'oklab()', category: 'perceptual', experimental: false },

  // color() 预定义空间 (9)
  {
    target: 'color-srgb',
    commandSuffix: 'srgb',
    label: 'color(srgb)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-srgb-linear',
    commandSuffix: 'srgbLinear',
    label: 'color(srgb-linear)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-display-p3',
    commandSuffix: 'displayP3',
    label: 'color(display-p3)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-display-p3-linear',
    commandSuffix: 'displayP3Linear',
    label: 'color(display-p3-linear)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-a98-rgb',
    commandSuffix: 'a98Rgb',
    label: 'color(a98-rgb)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-prophoto-rgb',
    commandSuffix: 'prophotoRgb',
    label: 'color(prophoto-rgb)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-rec2020',
    commandSuffix: 'rec2020',
    label: 'color(rec2020)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-xyz-d50',
    commandSuffix: 'xyzD50',
    label: 'color(xyz-d50)',
    category: 'color-function',
    experimental: false,
  },
  {
    target: 'color-xyz-d65',
    commandSuffix: 'xyzD65',
    label: 'color(xyz-d65)',
    category: 'color-function',
    experimental: false,
  },

  // 颜色名 (1)
  {
    target: 'named-color',
    commandSuffix: 'namedColor',
    label: '<named-color>',
    category: 'named',
    experimental: false,
  },

  // HDR 实验 (6)
  { target: 'ictcp', commandSuffix: 'ictcp', label: 'ictcp()', category: 'hdr', experimental: true },
  { target: 'jzazbz', commandSuffix: 'jzazbz', label: 'jzazbz()', category: 'hdr', experimental: true },
  { target: 'jzczhz', commandSuffix: 'jzczhz', label: 'jzczhz()', category: 'hdr', experimental: true },
  {
    target: 'color-rec2100-pq',
    commandSuffix: 'rec2100Pq',
    label: 'color(rec2100-pq)',
    category: 'hdr',
    experimental: true,
  },
  {
    target: 'color-rec2100-hlg',
    commandSuffix: 'rec2100Hlg',
    label: 'color(rec2100-hlg)',
    category: 'hdr',
    experimental: true,
  },
  {
    target: 'color-rec2100-linear',
    commandSuffix: 'rec2100Linear',
    label: 'color(rec2100-linear)',
    category: 'hdr',
    experimental: true,
  },
]);

export const FORMAT_CATEGORIES: readonly {
  readonly id: FormatCategoryId;
  readonly nlsKey: string;
  readonly experimental: boolean;
}[] = Object.freeze([
  { id: 'common', nlsKey: 'quickPick.categoryCommon', experimental: false },
  { id: 'perceptual', nlsKey: 'quickPick.categoryPerceptual', experimental: false },
  { id: 'color-function', nlsKey: 'quickPick.categoryColorFunction', experimental: false },
  { id: 'named', nlsKey: 'quickPick.categoryNamed', experimental: false },
  { id: 'hdr', nlsKey: 'quickPick.categoryHdr', experimental: true },
]);

const byTarget = new Map(FORMAT_CATALOG.map((entry) => [entry.target, entry]));
const bySuffix = new Map(FORMAT_CATALOG.map((entry) => [entry.commandSuffix, entry]));

export function formatByTarget(target: TargetFormat): FormatEntry | undefined {
  return byTarget.get(target);
}

export function formatByCommandSuffix(suffix: string): FormatEntry | undefined {
  return bySuffix.get(suffix);
}

export function formatsInCategory(category: FormatCategoryId): readonly FormatEntry[] {
  return FORMAT_CATALOG.filter((entry) => entry.category === category);
}
