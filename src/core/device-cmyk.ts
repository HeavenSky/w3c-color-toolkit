/**
 * `device-cmyk()` 的无 ICC fallback。
 *
 * CSS Color 5 把无可用 profile 时的求值定义为朴素转换:
 *   red   = 1 - min(1, c + k)
 *   green = 1 - min(1, m + k)
 *   blue  = 1 - min(1, y + k)
 * 结果一律标记 `approximate: true`。
 *
 * 该特性在 CSS Color 5 中被标为 at-risk, 因此与 Color 4 主路径解耦。
 */
import { buildResolved } from './colorjs-bridge.js';
import { readAlpha, readChannel, splitFunctionArguments, type ComponentValue } from './csstools-bridge.js';
import type { ResolvedColor } from './types.js';

export interface DeviceCmykResult {
  readonly resolved: ResolvedColor;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return value;
  return Math.min(1, Math.max(0, value));
}

/** 解析 `device-cmyk(c m y k [/ alpha])`; 无法解析时返回 undefined。 */
export function parseDeviceCmyk(node: ComponentValue): DeviceCmykResult | undefined {
  const args = splitFunctionArguments(node);
  if (args.groups.length !== 4) return undefined;

  const channels = args.groups.map((group) => readChannel(group, 1));
  if (channels.some((value) => value === undefined)) return undefined;
  const alpha = readAlpha(args.alpha);
  if (alpha === undefined) return undefined;

  const [c, m, y, k] = channels.map((value) => clamp01(value as number));
  // missing component 按 0 参与计算, 与规范的 missing component 处理一致。
  const cc = Number.isNaN(c) ? 0 : c;
  const mm = Number.isNaN(m) ? 0 : m;
  const yy = Number.isNaN(y) ? 0 : y;
  const kk = Number.isNaN(k) ? 0 : k;

  const red = 1 - Math.min(1, cc + kk);
  const green = 1 - Math.min(1, mm + kk);
  const blue = 1 - Math.min(1, yy + kk);

  const resolved = buildResolved({
    cssSpace: 'srgb',
    channels: [red, green, blue],
    alpha: Number.isNaN(alpha) ? 0 : alpha,
    approximate: true,
  });

  return { resolved };
}

/** 供 Hover 显示原始 CMYK 分量。 */
export function readDeviceCmykChannels(
  node: ComponentValue,
): { readonly channels: readonly number[]; readonly alpha: number } | undefined {
  const args = splitFunctionArguments(node);
  if (args.groups.length !== 4) return undefined;
  const channels = args.groups.map((group) => readChannel(group, 1));
  if (channels.some((value) => value === undefined)) return undefined;
  const alpha = readAlpha(args.alpha);
  if (alpha === undefined) return undefined;
  return { channels: channels as number[], alpha };
}
