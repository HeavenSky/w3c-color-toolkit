/**
 * Less 变量适配。
 *
 * Less 使用 `@name: value;`。与 SCSS 的区别在于 Less 是"最后定义优先",
 * 但只要同文件出现多个定义就无法静态确定使用点的取值, 因此仍按位置之前的最后一个定义解析,
 * 复杂值一律 contextual。
 */
import { isSimpleValue } from './scss-variables.js';
import type { TextDocumentLike, VariableDefinition } from './types.js';

const LESS_DECLARATION = /(@[A-Za-z0-9_-]+)\s*:\s*([^;{}]+?)\s*;/g;

/** `@media`、`@import` 等 at-rule 不是变量声明。 */
const AT_RULES = new Set([
  '@media',
  '@import',
  '@supports',
  '@keyframes',
  '@font-face',
  '@charset',
  '@namespace',
  '@page',
  '@layer',
  '@container',
  '@property',
  '@color-profile',
  '@use',
  '@forward',
  '@plugin',
]);

export function collectLessVariables(
  document: TextDocumentLike,
  definitions: Map<string, VariableDefinition[]>,
): void {
  const text = document.getText();
  LESS_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LESS_DECLARATION.exec(text)) !== null) {
    const name = match[1];
    if (AT_RULES.has(name.toLowerCase())) continue;
    const rawValue = match[2].trim();
    const list = definitions.get(name) ?? [];
    list.push({
      name,
      kind: 'less',
      rawValue,
      sourceUri: document.uri,
      offset: match.index,
    });
    definitions.set(name, list);
  }
}

export { isSimpleValue };
