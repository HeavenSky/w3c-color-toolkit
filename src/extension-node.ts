/**
 * Node / Remote Extension Host 入口。
 *
 * 不直接使用 `fs`、`path`; 工作区文件一律通过 `vscode.workspace.fs` 读取。
 */
import type * as vscode from 'vscode';

import { createWorkspaceFileReader } from './adapters/imports-node.js';
import { activateShared, deactivateShared } from './activate.js';

export function activate(context: vscode.ExtensionContext): void {
  activateShared(context, {
    createFileReader: createWorkspaceFileReader,
    hostKind: 'node',
  });
}

export function deactivate(): void {
  deactivateShared();
}
