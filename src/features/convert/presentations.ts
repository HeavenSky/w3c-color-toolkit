/**
 * 转换预览与信息损失判定。
 *
 * 这里只做纯计算, 不涉及 vscode API, 因此可以在单元测试中直接断言。
 */
import { serialize, targetSupportsAlpha, exactNamedColor, type TargetFormat } from '../../core/serializer.js';
import { convertTo } from '../../core/colorjs-bridge.js';
import type { ColorMatch, ResolvedColor, SerializedColor, SerializerOptions } from '../../core/types.js';

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

export function isRejection(
  value: ConvertPreview | { readonly rejection: ConvertRejection },
): value is { readonly rejection: ConvertRejection } {
  return 'rejection' in value;
}
