/**
 * 转换预览与信息损失判定。
 *
 * 这里只做纯计算, 不涉及 vscode API, 因此可以在单元测试中直接断言。
 */
import { serialize, targetSupportsAlpha, exactNamedColor, type TargetFormat } from '../../core/serializer.js';
import { convertTo } from '../../core/colorjs-bridge.js';
import type { ColorMatch, ResolvedColor, SerializedColor, SerializerOptions } from '../../core/types.js';
import { to8Bit, type PreviewSrgb } from '../highlight/preview-color.js';

export type ConvertRejection =
  | { readonly kind: 'contextual'; readonly detail: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'alpha-loss'; readonly target: TargetFormat }
  | { readonly kind: 'named-color-no-exact-match' };

export interface ConvertPreview {
  readonly serialized: SerializedColor;
  /** 需要用户确认才能继续。 */
  readonly needsConfirmation: readonly ('alpha-loss' | 'missing-component-loss')[];
}

export interface ConvertPolicy {
  readonly alphaLoss: 'reject' | 'confirm' | 'drop';
  readonly missingComponentLoss: 'confirm' | 'compute';
  readonly namedColorFallback: 'reject' | 'nearest';
  /** contextual 值是否已被用户显式允许按假设值转换。 */
  readonly allowAssumedContextual: boolean;
}

/** 取出可用于转换的颜色; 不可转换时返回拒绝原因。 */
export function convertSource(
  match: ColorMatch,
  policy: ConvertPolicy,
): { readonly resolved: ResolvedColor } | { readonly rejection: ConvertRejection } {
  // 变量引用只读: 把 `var(--brand)` 改写成 `#ff8800` 会销毁设计令牌。
  // 必须排在 resolved 分支之前 —— 解析成功后它与普通颜色已无从区分。
  if (match.resolvedVia) {
    return { rejection: { kind: 'contextual', detail: match.resolvedVia.variable } };
  }
  if (match.resolution === 'resolved' && match.resolved) return { resolved: match.resolved };
  if (match.resolution === 'contextual') {
    const assumed = match.contextual?.assumed?.resolved;
    if (assumed && policy.allowAssumedContextual) return { resolved: assumed };
    return {
      rejection: { kind: 'contextual', detail: match.contextual?.dependsOn ?? match.raw },
    };
  }
  return { rejection: { kind: 'invalid' } };
}

/** 计算一次转换的预览与需要的确认项。 */
export function previewConversion(
  resolved: ResolvedColor,
  target: TargetFormat,
  options: SerializerOptions,
  policy: ConvertPolicy,
): ConvertPreview | { readonly rejection: ConvertRejection } {
  const hasAlpha = resolved.alpha < 1;
  if (hasAlpha && !targetSupportsAlpha(target) && policy.alphaLoss === 'reject') {
    return { rejection: { kind: 'alpha-loss', target } };
  }

  if (target === 'named-color' && policy.namedColorFallback === 'reject') {
    const { coords } = convertTo(resolved, 'srgb');
    if (!exactNamedColor(coords)) {
      return { rejection: { kind: 'named-color-no-exact-match' } };
    }
  }

  const effectiveOptions: SerializerOptions = {
    ...options,
    computeMissingComponents:
      policy.missingComponentLoss === 'compute' ? true : options.computeMissingComponents,
  };

  const serialized = serialize(resolved, target, effectiveOptions);
  const needsConfirmation: ('alpha-loss' | 'missing-component-loss')[] = [];
  if (serialized.alphaLost && policy.alphaLoss === 'confirm') needsConfirmation.push('alpha-loss');
  if (serialized.missingComponentsLost && policy.missingComponentLoss === 'confirm') {
    needsConfirmation.push('missing-component-loss');
  }

  return { serialized, needsConfirmation };
}

/**
 * 原生取色器的候选写法。
 *
 * 顺序: 原格式优先 (保持作者的写法), 然后是四个常用格式; 已出现的文本去重。
 * 目标格式无法表达 alpha 时跳过, 避免用户在取色器里选一下就静默丢掉透明度 ——
 * 这与 `convert.alphaLoss: reject` 的默认策略一致。
 */
export function colorPresentationTexts(
  resolved: ResolvedColor,
  preferredTarget: TargetFormat | undefined,
  options: SerializerOptions,
): string[] {
  const hasAlpha = !Number.isNaN(resolved.alpha) && resolved.alpha < 1;
  const targets: TargetFormat[] = [];
  for (const target of [preferredTarget, 'hex', 'rgb', 'hsl', 'oklch'] as const) {
    if (!target || targets.includes(target)) continue;
    // hex 能表达 alpha (#RRGGBBAA), 其余按 targetSupportsAlpha 判断。
    if (hasAlpha && !targetSupportsAlpha(target)) continue;
    targets.push(target);
  }

  const texts: string[] = [];
  for (const target of targets) {
    if (target === 'named-color') {
      // 只在精确命中时给出颜色名, 否则取色器会把颜色悄悄换成最近似的名字。
      const { coords } = convertTo(resolved, 'srgb');
      if (!exactNamedColor(coords)) continue;
    }
    const { text } = serialize(resolved, target, options);
    if (text && !texts.includes(text)) texts.push(text);
  }
  return texts;
}

/** 取色器传回的颜色, 与 `vscode.Color` 同形; 这里不引用 vscode 以便单元测试。 */
export interface PickedRgba {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/**
 * 取色器传回的颜色是否就是该色块上报的预览色, 即用户没有改色。
 *
 * 必须按 VS Code 的精度比较而不是比浮点: 取色器打开时用上报的原值求候选写法, 之后每次
 * 重算 (点标题切换写法、点"原色"复位) 传回的都是它内部的 8-bit RGB 与三位小数的 alpha。
 * 精度以内的差异取色器本来就表达不了, 当作未改色不会丢失用户的操作。
 */
export function isUnchangedPick(picked: PickedRgba, preview: Pick<PreviewSrgb, 'coords' | 'alpha'>): boolean {
  const alphaOf = (alpha: number) => Math.round(Math.max(0, Math.min(1, alpha)) * 1000);
  return (
    to8Bit(picked.red) === to8Bit(preview.coords[0]) &&
    to8Bit(picked.green) === to8Bit(preview.coords[1]) &&
    to8Bit(picked.blue) === to8Bit(preview.coords[2]) &&
    alphaOf(picked.alpha) === alphaOf(preview.alpha)
  );
}

/**
 * 未改色时的候选写法: 第一项是原文, 其余由原值 (而不是取色器的 sRGB) 序列化。
 *
 * 取色器只在 sRGB 内传递颜色, 广色域与 HDR 值到它手里已经被映射过, 再转回原格式就是
 * 有损值; 色域内的值也会因 8-bit 量化与格式归一化而改变写法。原文排第一, 取色器打开时
 * 标题显示原文; 点标题切到的下一项则来自原值, 与"转换颜色"命令的结果一致。
 */
export function unchangedPresentationTexts(
  originalText: string,
  resolved: ResolvedColor,
  preferredTarget: TargetFormat | undefined,
  options: SerializerOptions,
): string[] {
  const rest = colorPresentationTexts(resolved, preferredTarget, options);
  return [originalText, ...rest.filter((text) => text !== originalText)];
}

export function isRejection(
  value: ConvertPreview | { readonly rejection: ConvertRejection },
): value is { readonly rejection: ConvertRejection } {
  return 'rejection' in value;
}
