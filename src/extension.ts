/**
 * 扩展入口。Node / Remote / Web Extension Host 共用同一个 bundle。
 *
 * 全部工作区文件读取都走 `vscode.workspace.fs` 与 `vscode.Uri`, 不使用 `fs`/`path`,
 * 因此三种宿主的行为一致, 也不需要为 Web 单独出一份产物。
 * `build.mjs` 按 browser platform 打包: 一旦有人引入 node 内置模块, 构建会直接失败。
 */
import type * as vscode from 'vscode';

import { activateShared, deactivateShared } from './activate.js';
import { createWorkspaceFileReader } from './adapters/workspace-file-reader.js';

/** 只用于日志: Web Extension Host 里没有 `process`。 */
const hostKind: 'node' | 'web' =
  typeof process !== 'undefined' && process.versions?.node ? 'node' : 'web';

export function activate(context: vscode.ExtensionContext): void {
  activateShared(context, {
    createFileReader: createWorkspaceFileReader,
    hostKind,
  });
}

export function deactivate(): void {
  deactivateShared();
}
