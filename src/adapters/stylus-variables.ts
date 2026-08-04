/**
 * Stylus 变量适配。
 *
 * Stylus 允许 `name = value` 与 `$name = value`, 且行尾可以没有分号。
 * 仅解析单行简单赋值; 缩进块、函数与 mixin 一律 contextual。
 */
import type { TextDocumentLike, VariableDefinition } from './types.js';

/** 行首的 `name = value` 或 `$name = value`, 排除 `==`、`>=` 之类比较。 */
const STYLUS_DECLARATION = /^[ \t]*(\$?[A-Za-z_][A-Za-z0-9_-]*)[ \t]*=[ \t]*([^=\n;{}][^\n;{}]*)$/gm;

export function collectStylusVariables(
  document: TextDocumentLike,
  definitions: Map<string, VariableDefinition[]>,
): void {
  const text = document.getText();
  STYLUS_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLUS_DECLARATION.exec(text)) !== null) {
    const name = match[1];
    const rawValue = match[2].trim();
    if (rawValue.length === 0) continue;
    const list = definitions.get(name) ?? [];
    list.push({
      name,
      kind: 'stylus',
      rawValue,
      sourceUri: document.uri,
      offset: match.index,
    });
    definitions.set(name, list);
  }
}
