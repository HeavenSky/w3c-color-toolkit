/**
 * Web Extension Host 入口。
 *
 * 与 Node 入口共享 `activate.ts`; 只有 FileReader 的注入不同。
 */
import type * as vscode from 'vscode';

import { createWorkspaceFileReader } from './adapters/imports-web.js';
import { activateShared, deactivateShared } from './activate.js';

export function activate(context: vscode.ExtensionContext): void {
  activateShared(context, {
    createFileReader: createWorkspaceFileReader,
    hostKind: 'web',
  });
}

export function deactivate(): void {
  deactivateShared();
}
