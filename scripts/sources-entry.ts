/**
 * 供 `gen-contributes.mjs` 打包导入的聚合入口。
 * 只重新导出纯数据, 不引入 vscode API。
 */
export {
  ADVANCED_KEY,
  ADVANCED_SETTINGS,
  CONFIG_SECTION,
  EXPOSED_SETTINGS,
} from '../src/configuration/schema.js';
export { HIDDEN_COMMANDS, VISIBLE_COMMANDS } from '../src/commands/ids.js';
export { FORMAT_CATALOG } from '../src/features/convert/format-catalog.js';
