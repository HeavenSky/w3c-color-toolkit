import { parseColorText, type ParseOptions } from '../../src/core/parser.js';
import type { ParsedColor } from '../../src/core/parser.js';
import type { ResolvedColor } from '../../src/core/types.js';

/** 默认解析选项: 实验开关关闭, 无上下文假设。 */
export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  cssColor6: false,
  cssColorHdr: false,
  contextualPreview: 'off',
  hdrAssumedHeadroom: 0,
};

export function parse(css: string, overrides: Partial<ParseOptions> = {}): ParsedColor {
  const result = parseColorText(css, { ...DEFAULT_PARSE_OPTIONS, ...overrides });
  if (!result) throw new Error(`failed to tokenize: ${css}`);
  return result;
}

export function resolvedOf(css: string, overrides: Partial<ParseOptions> = {}): ResolvedColor {
  const result = parse(css, overrides);
  if (!result.resolved) {
    throw new Error(`expected resolved color for ${css}, got ${result.resolution}`);
  }
  return result.resolved;
}

/** 方案第 10.1 节的数值容差。 */
export const TOLERANCE = {
  xyz: 1e-7,
  eightBit: 1,
  alpha: 1e-4,
} as const;

export function expectXyzClose(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
  tolerance = TOLERANCE.xyz,
): void {
  for (let index = 0; index < 3; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    if (delta > tolerance) {
      throw new Error(
        `XYZ D50 channel ${index} differs by ${delta} (actual ${actual[index]}, expected ${expected[index]})`,
      );
    }
  }
}

export function to8Bit(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}
