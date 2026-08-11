/**
 * 隐身闸门的 vscode 侧适配: 把 `TextDocument` 换算成 `disable-filter` 需要的三个纯数据字段。
 *
 * 全扩展只有这一处判断"要不要介入这个文档", 五条路径 (索引构建, 高亮渲染, Hover,
 * 原生色块/取色器, 转换命令) 都调它, 避免各自判一次而语义漂移。
 *
 * 长度口径是 UTF-16 码元而不是磁盘字节数: `workspace.fs.stat` 是异步的, 而 `ensure()`
 * 与高亮 `render()` 都在同步路径上; `document.getText()` 又会把整份文本实体化 ——
 * 那恰好是这个闸门本该省下的开销。`offsetAt(末行行尾)` 两者都不需要。
 */
import * as vscode from 'vscode';

import {
  disableReason,
  type DisableReason,
  type DisableRules,
} from './disable-filter.js';
import type { RuntimeConfiguration } from './load.js';

export type HiddenReason = 'disabled' | 'output-scheme' | DisableReason;

/**
 * 文档长度, 按 UTF-16 码元计。
 *
 * 取末行行尾的 offset 而不是 `new vscode.Position(document.lineCount, 0)`:
 * `lineCount - 1` 恒为合法行号 (空文档也有 1 行), 因此不依赖 `offsetAt` 对越界
 * Position 的钳制行为。
 */
export function documentLength(document: vscode.TextDocument): number {
  const lastLine = document.lineAt(document.lineCount - 1);
  return document.offsetAt(lastLine.range.end);
}

/** 取文件名。不用 `node:path`: 产物按 browser platform 打包, 不能引 node 内置模块。 */
export function baseNameOf(uri: vscode.Uri): string {
  const slash = uri.path.lastIndexOf('/');
  return slash === -1 ? uri.path : uri.path.slice(slash + 1);
}

/** 从运行时配置取出三条禁用规则; 供 `activate.ts` 上报无效模式时复用。 */
export function disableRulesOf(config: RuntimeConfiguration): DisableRules {
  return {
    maxFileSizeMb: config.maxFileSizeMb,
    fileNames: config.disabledFileNames,
    languageIds: config.disabledLanguageIds,
  };
}

/**
 * 该文档是否应被完全忽略, 以及原因。
 *
 * `output` scheme 是 Output Channel 自身的文档: 在那里高亮日志里的颜色没有意义,
 * 而且本扩展自己就往里写日志。
 */
export function hiddenReason(
  document: vscode.TextDocument,
  config: RuntimeConfiguration,
): HiddenReason | undefined {
  if (!config.enabled) return 'disabled';
  if (document.uri.scheme === 'output') return 'output-scheme';
  return disableReason(
    {
      baseName: baseNameOf(document.uri),
      languageId: document.languageId,
      length: documentLength(document),
    },
    disableRulesOf(config),
  );
}

export function isDocumentHidden(
  document: vscode.TextDocument,
  config: RuntimeConfiguration,
): boolean {
  return hiddenReason(document, config) !== undefined;
}
