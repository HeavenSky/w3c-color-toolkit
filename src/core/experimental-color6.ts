/**
 * CSS Color 6 (ED 2026-01-11) 支持, 默认关闭。
 *
 * 规范自述 "not yet ready for implementation", 因此本模块只做识别与可静态求值部分,
 * 不承诺数值稳定, 且与 Color 4/5 主路径解耦。
 *
 * CSSTools 4.1.10 实测不解析 `wcag2`、`wcag2()` 与 `color-layers()`,
 * 因此这里在 component value 树上自行解析。
 */
import { contrastRatio } from './colorjs-bridge.js';
import {
  functionName,
  isFunctionNode,
  readIdent,
  splitFunctionArguments,
  type ComponentValue,
} from './csstools-bridge.js';
import { COLOR6_WCAG2_LEVELS } from './keywords.js';
import type { ColorDiagnostic, ResolvedColor } from './types.js';
import { createDiagnostic } from './types.js';

export type Wcag2Level = 'aa' | 'aaa' | 'large';

/** WCAG 2.1 各级别的目标对比度。 */
const WCAG2_TARGET: Readonly<Record<Wcag2Level, number>> = Object.freeze({
  aa: 4.5,
  aaa: 7,
  large: 3,
});

export interface TargetContrast {
  readonly kind: 'wcag2';
  readonly level: Wcag2Level;
  readonly target: number;
}

/** 解析 `wcag2` 关键字或 `wcag2(aa | aaa | large)`。 */
export function parseTargetContrast(group: readonly ComponentValue[]): TargetContrast | undefined {
  if (group.length === 1 && isFunctionNode(group[0])) {
    const name = functionName(group[0]);
    if (name !== 'wcag2') return undefined;
    const args = splitFunctionArguments(group[0]);
    if (args.groups.length === 0) return { kind: 'wcag2', level: 'aa', target: WCAG2_TARGET.aa };
    const levelIdent = readIdent(args.groups[0])?.toLowerCase();
    if (!levelIdent || !COLOR6_WCAG2_LEVELS.includes(levelIdent)) return undefined;
    const level = levelIdent as Wcag2Level;
    return { kind: 'wcag2', level, target: WCAG2_TARGET[level] };
  }
  const ident = readIdent(group)?.toLowerCase();
  if (ident === 'wcag2') return { kind: 'wcag2', level: 'aa', target: WCAG2_TARGET.aa };
  return undefined;
}

/** `tbd-fg` / `tbd-bg` 的语义在草案中未定, 只识别不求值。 */
export function parseBaseRoleKeyword(group: readonly ComponentValue[]): string | undefined {
  const ident = readIdent(group)?.toLowerCase();
  if (ident === 'tbd-fg' || ident === 'tbd-bg') return ident;
  return undefined;
}

export interface Color6ContrastResult {
  readonly resolved: ResolvedColor;
  readonly syntax: 'contrast-color';
  readonly diagnostics: readonly ColorDiagnostic[];
}

/**
 * Color 6 扩展形式的 `contrast-color()`: 在候选颜色中选出对比度最高者,
 * 达到 `<target-contrast>` 要求时优先选择第一个达标项。
 */
export function selectContrastColor(
  base: ResolvedColor,
  candidates: readonly ResolvedColor[],
  target: TargetContrast | undefined,
): { readonly chosen: ResolvedColor; readonly ratio: number; readonly meetsTarget: boolean } | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestRatio = contrastRatio(base, candidates[0]);
  for (const candidate of candidates.slice(1)) {
    const ratio = contrastRatio(base, candidate);
    if (target && ratio >= target.target && bestRatio < target.target) {
      best = candidate;
      bestRatio = ratio;
      continue;
    }
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return { chosen: best, ratio: bestRatio, meetsTarget: target ? bestRatio >= target.target : true };
}

export interface ColorLayersResult {
  readonly resolved: ResolvedColor;
  readonly syntax: 'color-layers';
  readonly diagnostics: readonly ColorDiagnostic[];
}

/**
 * `color-layers()` 的合成。
 * 草案的 blend mode 语义仍在变化, 本期只实现 `normal` 的 source-over alpha 合成,
 * 其余 blend mode 产生 `upstream-unsupported` diagnostic 并按 `normal` 处理。
 */
export function compositeLayers(
  layers: readonly ResolvedColor[],
  blendMode: string | undefined,
): ColorLayersResult | undefined {
  if (layers.length === 0) return undefined;
  const diagnostics: ColorDiagnostic[] = [];
  if (blendMode && blendMode.toLowerCase() !== 'normal') {
    diagnostics.push(
      createDiagnostic('upstream-unsupported', 'info', 'diagnostic.colorLayersBlendMode', [blendMode]),
    );
  }

  // 从最底层向上做 source-over: 规范中先写的层在上方, 因此反向遍历。
  let accumulated = layers[layers.length - 1];
  for (let index = layers.length - 2; index >= 0; index -= 1) {
    accumulated = sourceOver(layers[index], accumulated);
  }
  return { resolved: accumulated, syntax: 'color-layers', diagnostics };
}

function sourceOver(source: ResolvedColor, backdrop: ResolvedColor): ResolvedColor {
  const alpha = source.alpha + backdrop.alpha * (1 - source.alpha);
  if (alpha === 0) {
    return { ...source, xyzD50: [0, 0, 0], alpha: 0, missingComponents: [], originalChannels: [0, 0, 0] };
  }
  const blend = (a: number, b: number): number =>
    (a * source.alpha + b * backdrop.alpha * (1 - source.alpha)) / alpha;
  return {
    xyzD50: [
      blend(source.xyzD50[0], backdrop.xyzD50[0]),
      blend(source.xyzD50[1], backdrop.xyzD50[1]),
      blend(source.xyzD50[2], backdrop.xyzD50[2]),
    ],
    alpha,
    originalSpace: 'xyz-d50',
    originalChannels: [null, null, null],
    missingComponents: [],
    approximate: source.approximate || backdrop.approximate,
    hdrToneMapped: source.hdrToneMapped || backdrop.hdrToneMapped,
  };
}
