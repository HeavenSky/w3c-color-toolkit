/**
 * 规范支持矩阵的只读展示。
 *
 * 内容与方案第 6 节一致; 状态随当前实验开关变化,
 * 因此用户看到的是"此刻真实生效"的支持级别, 而不是静态文档。
 */
import type { RuntimeConfiguration } from '../configuration/load.js';
import { NAMED_COLOR_COUNT, SYSTEM_COLORS, DEPRECATED_SYSTEM_COLORS } from '../core/keywords.js';

interface Row {
  readonly syntax: string;
  /** `R` 可解析, `C` 需上下文, `E` 实验, `-` 不适用。 */
  readonly state: 'R' | 'C' | 'E';
  readonly note?: string;
}

function rows(config: RuntimeConfiguration): Row[] {
  const hdr = config.cssColorHdr ? 'E' : 'E';
  return [
    { syntax: `${NAMED_COLOR_COUNT} 个 \`<named-color>\`、\`transparent\``, state: 'R' },
    { syntax: '`#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`', state: 'R' },
    { syntax: 'RGB/HSL legacy comma syntax', state: 'R' },
    { syntax: 'RGB/HSL modern space syntax', state: 'R' },
    { syntax: 'percentage、alpha、`deg/grad/rad/turn`', state: 'R' },
    { syntax: '`none`、静态 `calc()`', state: 'R' },
    { syntax: '`hwb()`', state: 'R' },
    { syntax: '`lab()` / `lch()` / `oklab()` / `oklch()`', state: 'R' },
    { syntax: '`color()` 的 10 个预定义空间', state: 'R', note: '广色域预览按色域映射' },
    { syntax: '`color-mix()` 两颜色与多颜色形式', state: 'R' },
    { syntax: '`color-mix()` hue 插值四个关键字', state: 'R' },
    { syntax: '相对颜色语法 (`from`)', state: 'R' },
    { syntax: 'Relative Alpha Color `alpha()`', state: 'R', note: 'CSS Color 5 at-risk' },
    { syntax: 'CSS Color 5 `contrast-color()`', state: 'R' },
    { syntax: '`device-cmyk()` 无 ICC fallback', state: 'R', note: '标记近似; at-risk' },
    { syntax: '`@color-profile` 有 `fallback` 描述符', state: 'R', note: 'at-risk' },
    { syntax: '`@color-profile` 无 `fallback`', state: 'C' },
    { syntax: '`var()` 唯一可解析定义或 fallback', state: 'R' },
    { syntax: '`var()` 多定义、循环或外部依赖', state: 'C' },
    { syntax: '`currentColor`', state: 'C' },
    { syntax: `${SYSTEM_COLORS.length} 个当前 \`<system-color>\``, state: 'C' },
    {
      syntax: `${Object.keys(DEPRECATED_SYSTEM_COLORS).length} 个 deprecated 系统色`,
      state: 'C',
      note: '显示替代关键字',
    },
    { syntax: '`light-dark()`', state: 'C', note: `contextualPreview = ${config.contextualPreview}` },
    { syntax: 'CSS Color 6 `color-layers()`', state: config.cssColor6 ? 'E' : 'E' },
    { syntax: 'CSS Color 6 扩展 `contrast-color()`', state: config.cssColor6 ? 'E' : 'E' },
    { syntax: 'CSS Color 6 `wcag2` / `wcag2()`', state: config.cssColor6 ? 'E' : 'E' },
    { syntax: 'CSS Color 6 `tbd-fg` / `tbd-bg`', state: config.cssColor6 ? 'E' : 'E' },
    { syntax: 'HDR `color(rec2100-pq / -hlg / -linear)`', state: hdr },
    { syntax: 'HDR `ictcp()` / `jzazbz()` / `jzczhz()`', state: hdr },
    { syntax: 'HDR `hdr-color()`', state: 'C', note: '依赖显示器 headroom' },
    { syntax: 'HDR `dynamic-range-limit`', state: '-' as 'R', note: '非颜色值, 只做误报排除' },
  ];
}

export function renderSupportMatrix(config: RuntimeConfiguration): string {
  const lines: string[] = [
    '# W3C Color Toolkit — 规范支持矩阵',
    '',
    '状态: `R` 可静态解析并得到绝对颜色; `C` 能识别但需要上下文; `E` 实验功能。',
    '',
    `- CSS Color 6 实验开关: ${config.cssColor6 ? '已开启' : '未开启'}`,
    `- CSS Color HDR 实验开关: ${config.cssColorHdr ? '已开启' : '未开启'}`,
    `- 上下文预览假设: ${config.contextualPreview}`,
    `- 色域映射策略: ${config.gamutMapping}`,
    `- HDR 色调映射: ${config.hdrToneMapping}`,
    '',
    '| 语法或能力 | 状态 | 说明 |',
    '| --- | --- | --- |',
  ];
  for (const row of rows(config)) {
    lines.push(`| ${row.syntax} | ${row.state} | ${row.note ?? ''} |`);
  }
  lines.push(
    '',
    '规范基线: CSS Color 4 ED 2026-07-28, CSS Color 5 ED 2026-07-31,',
    'CSS Color 6 ED 2026-01-11, CSS Color HDR 1 ED 2026-07-28。',
  );
  return lines.join('\n');
}
