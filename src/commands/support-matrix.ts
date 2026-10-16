/**
 * 规范支持矩阵的只读展示。
 *
 * 内容与方案第 6 节一致; 状态随当前实验开关变化,
 * 因此用户看到的是"此刻真实生效"的支持级别, 而不是静态文档。
 * 自然语言部分经 `t()` 本地化; 颜色语法、关键字、配置值与规范名保持原文。
 */
import type { RuntimeConfiguration } from '../configuration/load.js';
import { NAMED_COLOR_COUNT, SYSTEM_COLORS, DEPRECATED_SYSTEM_COLORS } from '../core/keywords.js';
import { t } from '../l10n/strings.js';

interface Row {
  readonly syntax: string;
  /** `R` 可解析, `C` 需上下文, `E` 实验, `-` 不适用。 */
  readonly state: 'R' | 'C' | 'E' | '-';
  readonly note?: string;
}

/** `color()` 的预定义色彩空间数量。 */
const PREDEFINED_COLOR_SPACE_COUNT = 10;

function rows(config: RuntimeConfiguration): Row[] {
  return [
    { syntax: t('matrix.row.namedColors', NAMED_COLOR_COUNT), state: 'R' },
    { syntax: '`#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`', state: 'R' },
    { syntax: 'RGB/HSL legacy comma syntax', state: 'R' },
    { syntax: 'RGB/HSL modern space syntax', state: 'R' },
    { syntax: t('matrix.row.units'), state: 'R' },
    { syntax: t('matrix.row.noneCalc'), state: 'R' },
    { syntax: '`hwb()`', state: 'R' },
    { syntax: '`lab()` / `lch()` / `oklab()` / `oklch()`', state: 'R' },
    {
      syntax: t('matrix.row.predefinedSpaces', PREDEFINED_COLOR_SPACE_COUNT),
      state: 'R',
      note: t('matrix.note.wideGamut'),
    },
    { syntax: t('matrix.row.colorMixForms'), state: 'R' },
    { syntax: t('matrix.row.colorMixHue'), state: 'R' },
    { syntax: t('matrix.row.relativeColor'), state: 'R' },
    { syntax: 'Relative Alpha Color `alpha()`', state: 'R', note: 'CSS Color 5 at-risk' },
    { syntax: 'CSS Color 5 `contrast-color()`', state: 'R' },
    { syntax: t('matrix.row.deviceCmykNaive'), state: 'R', note: t('matrix.note.approximateAtRisk') },
    { syntax: t('matrix.row.profileWithFallback'), state: 'R', note: 'at-risk' },
    { syntax: t('matrix.row.profileWithoutFallback'), state: 'C' },
    { syntax: t('matrix.row.varUnique'), state: 'R' },
    { syntax: t('matrix.row.varAmbiguous'), state: 'C' },
    { syntax: '`currentColor`', state: 'C' },
    { syntax: t('matrix.row.systemColors', SYSTEM_COLORS.length), state: 'C' },
    {
      syntax: t('matrix.row.deprecatedSystemColors', Object.keys(DEPRECATED_SYSTEM_COLORS).length),
      state: 'C',
      note: t('matrix.note.replacementKeyword'),
    },
    { syntax: '`light-dark()`', state: 'C', note: `contextualPreview = ${config.contextualPreview}` },
    { syntax: 'CSS Color 6 `color-layers()`', state: 'E' },
    { syntax: t('matrix.row.color6ContrastColor'), state: 'E' },
    { syntax: 'CSS Color 6 `wcag2` / `wcag2()`', state: 'E' },
    { syntax: 'CSS Color 6 `tbd-fg` / `tbd-bg`', state: 'E' },
    { syntax: 'HDR `color(rec2100-pq / -hlg / -linear)`', state: 'E' },
    { syntax: 'HDR `ictcp()` / `jzazbz()` / `jzczhz()`', state: 'E' },
    { syntax: 'HDR `hdr-color()`', state: 'C', note: t('matrix.note.displayHeadroom') },
    { syntax: 'HDR `dynamic-range-limit`', state: '-', note: t('matrix.note.notAColorValue') },
  ];
}

function flag(enabled: boolean): string {
  return enabled ? t('matrix.flagOn') : t('matrix.flagOff');
}

export function renderSupportMatrix(config: RuntimeConfiguration): string {
  const lines: string[] = [
    `# ${t('matrix.title')}`,
    '',
    t('matrix.legend'),
    '',
    `- ${t('matrix.cssColor6Flag', flag(config.cssColor6))}`,
    `- ${t('matrix.cssColorHdrFlag', flag(config.cssColorHdr))}`,
    `- ${t('matrix.contextualPreview', config.contextualPreview)}`,
    `- ${t('matrix.gamutMapping', config.gamutMapping)}`,
    `- ${t('matrix.hdrToneMapping', config.hdrToneMapping)}`,
    '',
    `| ${t('matrix.headerSyntax')} | ${t('matrix.headerState')} | ${t('matrix.headerNote')} |`,
    '| --- | --- | --- |',
  ];
  for (const row of rows(config)) {
    lines.push(`| ${row.syntax} | ${row.state} | ${row.note ?? ''} |`);
  }
  lines.push('', t('matrix.baseline'));
  return lines.join('\n');
}
