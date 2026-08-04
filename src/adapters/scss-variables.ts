/**
 * SCSS / Sass 变量适配。
 *
 * 只解析"同文件中位置之前的唯一简单赋值"与别名链;
 * 多重作用域、函数调用、mixin 运算一律标记 contextual, 不做求值。
 */
import type {
  TextDocumentLike,
  VariableContext,
  VariableDefinition,
  VariableResolution,
} from './types.js';

/** `$name: value;`。`!default` 与 `!global` 视为简单赋值。 */
const SCSS_DECLARATION = /(\$[A-Za-z0-9_-]+)\s*:\s*([^;{}]+?)\s*(?:!default|!global)?\s*;/g;

/** 含运算符、函数调用或插值的值不视为简单赋值。 */
const NON_SIMPLE = /[+*/]|\$\{|#\{|\b[a-zA-Z-]+\s*\(/;

export function isSimpleValue(rawValue: string): boolean {
  // 颜色函数本身是允许的, 因此先排除已知颜色函数再判断。
  const withoutColorFunctions = rawValue.replace(
    /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|alpha|contrast-color|device-cmyk|light-dark|ictcp|jzazbz|jzczhz|hdr-color|color-hdr|color-layers|calc)\s*\(/g,
    '',
  );
  return !NON_SIMPLE.test(withoutColorFunctions);
}

export function collectScssVariables(
  document: TextDocumentLike,
  definitions: Map<string, VariableDefinition[]>,
  kind: 'scss' | 'less' | 'stylus' = 'scss',
): void {
  const text = document.getText();
  SCSS_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCSS_DECLARATION.exec(text)) !== null) {
    const list = definitions.get(match[1]) ?? [];
    list.push({
      name: match[1],
      kind,
      rawValue: match[2].trim(),
      sourceUri: document.uri,
      offset: match.index,
    });
    definitions.set(match[1], list);
  }
}

/**
 * 解析预处理器变量。
 * 取 offset 之前最后一个定义 (预处理器是顺序求值的), 但存在多个候选时仍要求值简单。
 */
export function resolvePreprocessorVariable(
  name: string,
  atOffset: number,
  context: VariableContext,
  maxDepth = 20,
): VariableResolution {
  const definitions = context.definitions.get(name);
  if (!definitions || definitions.length === 0) return { kind: 'contextual', reason: 'no-definition' };

  // 同文件中位置之前的定义; 跨文件导入的定义没有可比 offset, 一律视为可用。
  const candidates = definitions.filter(
    (definition) => definition.offset < atOffset || definition.sourceUri !== definitionsUri(definitions),
  );
  const usable = candidates.length > 0 ? candidates : definitions;
  const last = usable[usable.length - 1];
  if (!isSimpleValue(last.rawValue)) return { kind: 'contextual', reason: 'multiple-definitions' };

  // 别名链: `$a: $b;`
  const alias = /^(\$[A-Za-z0-9_-]+|@[A-Za-z0-9_-]+)$/.exec(last.rawValue);
  if (alias) {
    if (maxDepth <= 0) return { kind: 'contextual', reason: 'max-depth' };
    if (alias[1] === name) return { kind: 'contextual', reason: 'circular' };
    return resolvePreprocessorVariable(alias[1], atOffset, context, maxDepth - 1);
  }

  return { kind: 'resolved', rawValue: last.rawValue };
}

function definitionsUri(definitions: readonly VariableDefinition[]): string {
  return definitions[0]?.sourceUri ?? '';
}
