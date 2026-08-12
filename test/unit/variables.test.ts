/**
 * 变量引用的解析补丁。
 *
 * 这里锁定两条容易被改坏的约定:
 * - 解析不出来的变量**从结果中移除**, 而不是留一个没有颜色的 match —— 否则 SCSS 里
 *   每个 `$foo` 都会弹出 Hover 面板, 而改造前它们什么都不弹;
 * - 解析成功的变量带 `resolvedVia`, 供转换与取色器判定只读。
 */
import { describe, expect, it } from 'vitest';

import type { VariableContext, VariableDefinition } from '../../src/adapters/types.js';
import { convertSource, type ConvertPolicy } from '../../src/features/convert/presentations.js';
import {
  isVariableMatch,
  patchVariableMatches,
  type PatchOptions,
} from '../../src/index/variable-patch.js';
import type { ColorMatch } from '../../src/core/types.js';

import { DEFAULT_PARSE_OPTIONS, resolvedOf } from './helpers.js';

const OPTIONS: PatchOptions = { parseOptions: DEFAULT_PARSE_OPTIONS, maxResolveDepth: 20 };

const SOURCE = 'file:///a.scss';

function definition(overrides: Partial<VariableDefinition> & { name: string }): VariableDefinition {
  return {
    kind: 'scss',
    rawValue: '#ff8800',
    sourceUri: SOURCE,
    offset: 0,
    ...overrides,
  };
}

function context(definitions: readonly VariableDefinition[]): VariableContext {
  const grouped = new Map<string, VariableDefinition[]>();
  for (const item of definitions) {
    const list = grouped.get(item.name) ?? [];
    list.push(item);
    grouped.set(item.name, list);
  }
  return { definitions: grouped, colorProfileFallbacks: new Map(), version: 0, issues: [] };
}

/** 变量引用占位, 与扫描器产出的形状一致。 */
function variableMatch(variable: string, syntax = 'scss-variable'): ColorMatch {
  return {
    raw: variable,
    range: { start: 40, end: 40 + variable.length },
    syntax,
    specLevel: 'color-4',
    experimental: false,
    resolution: 'contextual',
    contextual: { reason: 'preprocessor-variable', dependsOn: variable, branches: [] },
    diagnostics: [],
  };
}

/** 一个普通的非变量 match, 用于验证顺序与原样保留。 */
function hexMatch(start: number): ColorMatch {
  return {
    raw: '#0088ff',
    range: { start, end: start + 7 },
    syntax: 'hex',
    specLevel: 'color-4',
    experimental: false,
    resolution: 'resolved',
    resolved: resolvedOf('#0088ff'),
    diagnostics: [],
  };
}

describe('isVariableMatch', () => {
  it('三种变量 syntax 都算, 已解析的不再算', () => {
    expect(isVariableMatch(variableMatch('$a', 'scss-variable'))).toBe(true);
    expect(isVariableMatch(variableMatch('--a', 'css-variable'))).toBe(true);
    expect(isVariableMatch(variableMatch('@a', 'less-variable'))).toBe(true);
    expect(isVariableMatch(hexMatch(0))).toBe(false);
    expect(
      isVariableMatch({ ...variableMatch('$a'), resolvedVia: { variable: '$a' } }),
    ).toBe(false);
  });
});

describe('解析成功', () => {
  it('SCSS 简单赋值可解析, 并带 resolvedVia', () => {
    const [patched] = patchVariableMatches(
      [variableMatch('$brand')],
      context([definition({ name: '$brand' })]),
      OPTIONS,
    );
    expect(patched.resolution).toBe('resolved');
    expect(patched.resolved).toBeDefined();
    expect(patched.resolvedVia).toEqual({ variable: '$brand' });
    // range 与 raw 不变, 仍指向文档中的变量引用原文。
    expect(patched.raw).toBe('$brand');
    expect(patched.range).toEqual({ start: 40, end: 46 });
    // contextual 必须被清掉, 否则 Hover 会同时显示两种结论。
    expect(patched.contextual).toBeUndefined();
  });

  it('CSS 自定义属性的唯一 :root 定义可解析', () => {
    const [patched] = patchVariableMatches(
      [variableMatch('--brand', 'css-variable')],
      context([
        definition({ name: '--brand', kind: 'css-custom-property', selector: ':root' }),
      ]),
      OPTIONS,
    );
    expect(patched.resolution).toBe('resolved');
    expect(patched.resolvedVia).toEqual({ variable: '--brand' });
  });

  it('已知颜色函数作为变量值可解析', () => {
    // `isSimpleValue` 会先剥离已知颜色函数再判定, 因此这类值是刻意支持的。
    const patched = patchVariableMatches(
      [variableMatch('$brand')],
      context([definition({ name: '$brand', rawValue: 'rgb(255 136 0)' })]),
      OPTIONS,
    );
    expect(patched).toHaveLength(1);
    expect(patched[0].resolution).toBe('resolved');
  });

  it('别名链可解析', () => {
    const patched = patchVariableMatches(
      [variableMatch('$a')],
      context([
        definition({ name: '$a', rawValue: '$b' }),
        definition({ name: '$b', rawValue: '#ff8800' }),
      ]),
      OPTIONS,
    );
    expect(patched).toHaveLength(1);
    expect(patched[0].resolution).toBe('resolved');
  });
});

describe('解析失败一律移除', () => {
  const removed = (definitions: readonly VariableDefinition[], variable = '$brand'): number =>
    patchVariableMatches([variableMatch(variable)], context(definitions), OPTIONS).length;

  it('没有定义', () => {
    expect(removed([])).toBe(0);
  });

  it('多个 :root 定义时不猜 cascade 胜者', () => {
    const patched = patchVariableMatches(
      [variableMatch('--brand', 'css-variable')],
      context([
        definition({ name: '--brand', kind: 'css-custom-property', selector: ':root' }),
        definition({
          name: '--brand',
          kind: 'css-custom-property',
          selector: ':root',
          rawValue: '#0088ff',
          offset: 10,
        }),
      ]),
      OPTIONS,
    );
    expect(patched).toHaveLength(0);
  });

  it('只有局部选择器定义', () => {
    const patched = patchVariableMatches(
      [variableMatch('--brand', 'css-variable')],
      context([
        definition({ name: '--brand', kind: 'css-custom-property', selector: '.dark' }),
      ]),
      OPTIONS,
    );
    expect(patched).toHaveLength(0);
  });

  it('含运算的值不视为简单赋值', () => {
    expect(removed([definition({ name: '$brand', rawValue: '#ff8800 + 1' })])).toBe(0);
    expect(removed([definition({ name: '$brand', rawValue: 'darken($x, 10%)' })])).toBe(0);
  });

  it('自引用别名判定为循环', () => {
    expect(removed([definition({ name: '$brand', rawValue: '$brand' })])).toBe(0);
  });

  it('别名链超过深度上限', () => {
    const patched = patchVariableMatches(
      [variableMatch('$a')],
      context([
        definition({ name: '$a', rawValue: '$b' }),
        definition({ name: '$b', rawValue: '#ff8800' }),
      ]),
      { ...OPTIONS, maxResolveDepth: 0 },
    );
    expect(patched).toHaveLength(0);
  });

  it('解析出来的值本身不是颜色', () => {
    expect(removed([definition({ name: '$brand', rawValue: '12px' })])).toBe(0);
  });
});

describe('上下文缺失', () => {
  it('context 为 undefined 时移除全部变量 match', () => {
    const patched = patchVariableMatches(
      [variableMatch('$a'), variableMatch('--b', 'css-variable'), variableMatch('@c', 'less-variable')],
      undefined,
      OPTIONS,
    );
    expect(patched).toHaveLength(0);
  });
});

describe('非变量 match', () => {
  it('原样保留且顺序不变', () => {
    const first = hexMatch(0);
    const second = hexMatch(100);
    const patched = patchVariableMatches(
      [first, variableMatch('$missing'), second],
      context([]),
      OPTIONS,
    );
    expect(patched).toEqual([first, second]);
  });

  it('没有变量 match 时原数组被直接返回', () => {
    const matches = [hexMatch(0), hexMatch(100)];
    expect(patchVariableMatches(matches, undefined, OPTIONS)).toBe(matches);
  });
});

describe('只读约束', () => {
  const POLICY: ConvertPolicy = {
    alphaLoss: 'reject',
    missingComponentLoss: 'confirm',
    namedColorFallback: 'reject',
    allowAssumedContextual: false,
  };

  it('带 resolvedVia 的 match 被转换拒绝, 并给出所依赖的变量名', () => {
    const [patched] = patchVariableMatches(
      [variableMatch('$brand')],
      context([definition({ name: '$brand' })]),
      OPTIONS,
    );
    const result = convertSource(patched, POLICY);
    expect('rejection' in result).toBe(true);
    if ('rejection' in result) {
      expect(result.rejection).toEqual({ kind: 'contextual', detail: '$brand' });
    }
  });

  it('普通颜色不受影响', () => {
    expect('resolved' in convertSource(hexMatch(0), POLICY)).toBe(true);
  });
});
