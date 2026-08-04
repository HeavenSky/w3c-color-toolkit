/**
 * 冒烟检查入口: 只聚合不依赖 vscode API 的纯逻辑。
 */
export { scanText } from '../src/core/scanner.js';
export { serialize } from '../src/core/serializer.js';
export { fieldValue, resolveFieldOrder } from '../src/features/info/fields.js';
export { convertSource, previewConversion } from '../src/features/convert/presentations.js';
export { computePreviewColor, previewSource } from '../src/features/highlight/preview-color.js';
export { advancedDefaults } from '../src/configuration/schema.js';
export { resolveAdvanced } from '../src/configuration/advanced.js';
export { isLanguageEnabled } from '../src/configuration/language-filter.js';

import { renderSupportMatrix } from '../src/commands/support-matrix.js';
import type { RuntimeConfiguration } from '../src/configuration/load.js';

/** 支持矩阵渲染只读配置字段, 这里构造一个最小配置以便离线检查。 */
export function renderSupportMatrixRows(): string {
  const config = {
    cssColor6: true,
    cssColorHdr: true,
    contextualPreview: 'off',
    gamutMapping: 'css',
    hdrToneMapping: 'reinhard',
  } as unknown as RuntimeConfiguration;
  return renderSupportMatrix(config);
}
