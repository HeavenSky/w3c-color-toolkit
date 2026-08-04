import { describe, expect, it } from 'vitest';

import {
  collectCssCustomProperties,
  expandVarChain,
  resolveCssCustomProperty,
} from '../../src/adapters/css-custom-properties.js';
import { collectLessVariables } from '../../src/adapters/less-variables.js';
import { collectScssVariables, isSimpleValue, resolvePreprocessorVariable } from '../../src/adapters/scss-variables.js';
import { collectStylusVariables } from '../../src/adapters/stylus-variables.js';
import { collectVariableContext, resolveVariable } from '../../src/adapters/variable-context.js';
import type { FileReader, TextDocumentLike, VariableContext, VariableDefinition } from '../../src/adapters/types.js';

import { DEFAULT_PARSE_OPTIONS } from './helpers.js';

function doc(text: string, languageId = 'css', uri = 'file:///w/a.css'): TextDocumentLike {
  return { uri, languageId, getText: () => text };
}

function contextFrom(definitions: Map<string, VariableDefinition[]>): VariableContext {
  return { definitions, colorProfileFallbacks: new Map(), version: 1, issues: [] };
}

const COLLECT_OPTIONS = {
  resolveVariables: true,
  includePaths: [] as string[],
  maxImportDepth: 20,
  maxImportFiles: 200,
  maxResolveDepth: 20,
};

function reader(files: Record<string, string>, trusted = true): FileReader {
  return {
    isTrusted: () => trusted,
    resolveImport: (fromUri, specifier) => {
      const base = fromUri.slice(0, fromUri.lastIndexOf('/'));
      return [`${base}/${specifier}.scss`, `${base}/_${specifier}.scss`];
    },
    read: async (uri) => files[uri],
  };
}

describe('CSS 自定义属性', () => {
  it(':root 唯一定义可解析', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --brand: #ff8800; }'), definitions);
    const resolution = resolveCssCustomProperty('--brand', contextFrom(definitions));
    expect(resolution).toEqual({ kind: 'resolved', rawValue: '#ff8800' });
  });

  it(':host 也视为 root 级', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':host { --brand: red; }'), definitions);
    expect(resolveCssCustomProperty('--brand', contextFrom(definitions)).kind).toBe('resolved');
  });

  it('没有定义时是 contextual', () => {
    const resolution = resolveCssCustomProperty('--missing', contextFrom(new Map()));
    expect(resolution).toEqual({ kind: 'contextual', reason: 'no-definition' });
  });

  it('多个 root 定义时不猜测胜者', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --brand: red; }\n:root { --brand: blue; }'), definitions);
    expect(resolveCssCustomProperty('--brand', contextFrom(definitions))).toEqual({
      kind: 'contextual',
      reason: 'multiple-definitions',
    });
  });

  it('只有局部选择器定义时标记 contextual, 不猜测 cascade', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc('.card { --brand: red; }'), definitions);
    expect(resolveCssCustomProperty('--brand', contextFrom(definitions)).kind).toBe('contextual');
  });

  it('root 与局部同名时仍取 root', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --brand: red; }\n.card { --brand: blue; }'), definitions);
    expect(resolveCssCustomProperty('--brand', contextFrom(definitions))).toEqual({
      kind: 'resolved',
      rawValue: 'red',
    });
  });
});

describe('var() 链展开', () => {
  it('递归解析 var() 引用', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --a: var(--b); --b: #123456; }'), definitions);
    const expanded = expandVarChain('var(--a)', contextFrom(definitions), 20);
    expect(expanded.text).toBe('#123456');
  });

  it('使用 fallback 当变量不可解析', () => {
    const expanded = expandVarChain('var(--missing, #abcdef)', contextFrom(new Map()), 20);
    expect(expanded.text).toBe('#abcdef');
  });

  it('检测循环引用而不是无限递归', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --a: var(--b); --b: var(--a); }'), definitions);
    const expanded = expandVarChain('var(--a)', contextFrom(definitions), 20);
    expect(expanded.issues.some((issue) => issue.kind === 'circular')).toBe(true);
  });

  it('达到深度上限时给出 max-depth', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectCssCustomProperties(doc(':root { --a: var(--b); --b: var(--c); --c: red; }'), definitions);
    const expanded = expandVarChain('var(--a)', contextFrom(definitions), 1);
    expect(expanded.issues.some((issue) => issue.kind === 'max-depth')).toBe(true);
  });
});

describe('SCSS 变量', () => {
  it('位置之前的唯一简单赋值可解析', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    const text = '$brand: #ff8800;\n.a { color: $brand; }';
    collectScssVariables(doc(text, 'scss'), definitions);
    const resolution = resolvePreprocessorVariable('$brand', text.indexOf('color'), contextFrom(definitions));
    expect(resolution).toEqual({ kind: 'resolved', rawValue: '#ff8800' });
  });

  it('!default 仍视为简单赋值', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectScssVariables(doc('$brand: red !default;', 'scss'), definitions);
    expect(resolvePreprocessorVariable('$brand', 999, contextFrom(definitions)).kind).toBe('resolved');
  });

  it('别名链可解析', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectScssVariables(doc('$base: #ff8800;\n$brand: $base;', 'scss'), definitions);
    expect(resolvePreprocessorVariable('$brand', 999, contextFrom(definitions))).toEqual({
      kind: 'resolved',
      rawValue: '#ff8800',
    });
  });

  it('自引用别名判定为循环', () => {
    const definitions = new Map<string, VariableDefinition[]>([
      ['$a', [{ name: '$a', kind: 'scss', rawValue: '$a', sourceUri: 'file:///w/a.scss', offset: 0 }]],
    ]);
    expect(resolvePreprocessorVariable('$a', 999, contextFrom(definitions)).kind).toBe('contextual');
  });

  it('含运算或函数的值不视为简单赋值', () => {
    expect(isSimpleValue('#ff8800')).toBe(true);
    expect(isSimpleValue('rgb(255 136 0)')).toBe(true);
    expect(isSimpleValue('darken($base, 10%)')).toBe(false);
    expect(isSimpleValue('$a + $b')).toBe(false);
    expect(isSimpleValue('#{$name}')).toBe(false);
  });

  it('复杂值降级为 contextual', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectScssVariables(doc('$brand: darken(red, 10%);', 'scss'), definitions);
    expect(resolvePreprocessorVariable('$brand', 999, contextFrom(definitions)).kind).toBe('contextual');
  });
});

describe('Less 与 Stylus 变量', () => {
  it('Less 的 @name 被收集, at-rule 不被误收', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectLessVariables(doc('@brand: #ff8800;\n@import "other";', 'less'), definitions);
    expect(definitions.has('@brand')).toBe(true);
    expect(definitions.has('@import')).toBe(false);
  });

  it('Stylus 的 name = value 被收集', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectStylusVariables(doc('brand = #ff8800\n$other = red', 'stylus'), definitions);
    expect(definitions.get('brand')?.[0].rawValue).toBe('#ff8800');
    expect(definitions.get('$other')?.[0].rawValue).toBe('red');
  });

  it('Stylus 不把比较误当赋值', () => {
    const definitions = new Map<string, VariableDefinition[]>();
    collectStylusVariables(doc('a == b', 'stylus'), definitions);
    expect(definitions.size).toBe(0);
  });
});

describe('变量上下文收集', () => {
  it('收集 @color-profile 的 fallback 描述符', async () => {
    const context = await collectVariableContext(
      doc('@color-profile --my { src: url(x.icc); fallback: #ff8800; }'),
      COLLECT_OPTIONS,
      reader({}),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.colorProfileFallbacks.has('--my')).toBe(true);
  });

  it('跨文件导入被收集', async () => {
    const files = { 'file:///w/vars.scss': '$brand: #ff8800;' };
    const context = await collectVariableContext(
      doc('@import "vars";\n.a { color: $brand; }', 'scss', 'file:///w/a.scss'),
      COLLECT_OPTIONS,
      reader(files),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.definitions.has('$brand')).toBe(true);
  });

  it('未受信任工作区不跨文件读取, 但仍解析当前文档', async () => {
    const files = { 'file:///w/vars.scss': '$imported: red;' };
    const context = await collectVariableContext(
      doc('$local: red;\n@import "vars";', 'scss', 'file:///w/a.scss'),
      COLLECT_OPTIONS,
      reader(files, false),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.definitions.has('$local')).toBe(true);
    expect(context.definitions.has('$imported')).toBe(false);
    expect(context.issues.some((issue) => issue.kind === 'untrusted-workspace')).toBe(true);
  });

  it('resolveVariables 关闭时不跨文件读取', async () => {
    const files = { 'file:///w/vars.scss': '$imported: red;' };
    const context = await collectVariableContext(
      doc('@import "vars";', 'scss', 'file:///w/a.scss'),
      { ...COLLECT_OPTIONS, resolveVariables: false },
      reader(files),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.definitions.has('$imported')).toBe(false);
  });

  it('文件数上限生效', async () => {
    const files = {
      'file:///w/a1.scss': '$a: red;',
      'file:///w/a2.scss': '$b: red;',
    };
    const context = await collectVariableContext(
      doc('@import "a1"; @import "a2";', 'scss', 'file:///w/a.scss'),
      { ...COLLECT_OPTIONS, maxImportFiles: 1 },
      reader(files),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.issues.some((issue) => issue.kind === 'import-not-allowed')).toBe(true);
  });

  it('深度上限生效', async () => {
    const files = {
      'file:///w/one.scss': '@import "two";',
      'file:///w/two.scss': '$deep: red;',
    };
    const context = await collectVariableContext(
      doc('@import "one";', 'scss', 'file:///w/a.scss'),
      { ...COLLECT_OPTIONS, maxImportDepth: 1 },
      reader(files),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.definitions.has('$deep')).toBe(false);
    expect(context.issues.some((issue) => issue.kind === 'max-depth')).toBe(true);
  });

  it('循环导入被检测', async () => {
    const files = {
      'file:///w/loop.scss': '@import "a";',
      'file:///w/a.scss': '@import "loop";',
    };
    const context = await collectVariableContext(
      doc('@import "loop";', 'scss', 'file:///w/a.scss'),
      COLLECT_OPTIONS,
      reader(files),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(context.issues.some((issue) => issue.kind === 'circular')).toBe(true);
  });

  it('resolveVariable 统一处理 CSS 与预处理器变量', async () => {
    const context = await collectVariableContext(
      doc(':root { --brand: #ff8800; }'),
      COLLECT_OPTIONS,
      reader({}),
      DEFAULT_PARSE_OPTIONS,
    );
    expect(resolveVariable('--brand', 0, context, 20)).toEqual({
      kind: 'resolved',
      rawValue: '#ff8800',
    });
  });
});
