/**
 * 命令注册。
 *
 * 5 个可见命令 + 31 个隐藏命令 (24 个 `convertTo.*` 与 7 个 `manage` 条目)。
 * 隐藏只作用于命令面板, 用户仍可在 Keyboard Shortcuts 中绑定。
 * 本期不声明任何默认快捷键。
 */
import * as vscode from 'vscode';

import type { RuntimeConfiguration } from '../configuration/load.js';
import { formatByCommandSuffix } from '../features/convert/format-catalog.js';
import type { ConvertController } from '../features/convert/convert-controller.js';
import type { HighlightController } from '../features/highlight/highlight-controller.js';
import { runMigrationCommand } from '../features/migration/legacy-settings.js';
import type { DocumentIndexManager } from '../index/document-index-manager.js';
import { t } from '../l10n/strings.js';
import type { Logger } from '../logging/output-channel.js';

import { CONVERT_COMMANDS, COMMAND_PREFIX, HDR_CONTEXT_KEY } from './ids.js';
import {
  effectiveConfigurationLines,
  runConfigureInfoFields,
  runManage,
  runToggleFeatures,
} from './quick-pick.js';
import { renderSupportMatrix } from './support-matrix.js';

export interface CommandDependencies {
  readonly manager: DocumentIndexManager;
  readonly highlight: HighlightController;
  readonly convert: ConvertController;
  readonly logger: Logger;
  readonly getConfig: (document?: vscode.TextDocument) => RuntimeConfiguration;
}

function activeEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage(t('ui.noEditor'));
    return undefined;
  }
  return editor;
}

export function registerCommands(deps: CommandDependencies): vscode.Disposable[] {
  const { manager, highlight, convert, logger, getConfig } = deps;
  const disposables: vscode.Disposable[] = [];
  const register = (id: string, handler: (...args: unknown[]) => unknown): void => {
    disposables.push(vscode.commands.registerCommand(id, handler));
  };

  // ── 可见命令 (5) ────────────────────────────────────────────────
  register(`${COMMAND_PREFIX}.convert`, async () => {
    const editor = activeEditor();
    if (editor) await convert.convertWithPicker(editor, false);
  });

  register(`${COMMAND_PREFIX}.copyColorAs`, async () => {
    const editor = activeEditor();
    if (editor) await convert.convertWithPicker(editor, true);
  });

  register(`${COMMAND_PREFIX}.toggleFeatures`, async () => {
    await runToggleFeatures(getConfig());
  });

  register(`${COMMAND_PREFIX}.configureInfoFields`, async () => {
    await runConfigureInfoFields(getConfig());
  });

  register(`${COMMAND_PREFIX}.manage`, async () => {
    await runManage();
  });

  // ── 隐藏的 24 个直达转换命令 ──────────────────────────────────
  for (const command of CONVERT_COMMANDS) {
    const suffix = command.id.slice(`${COMMAND_PREFIX}.convertTo.`.length);
    const entry = formatByCommandSuffix(suffix);
    if (!entry) continue;
    register(command.id, async () => {
      const editor = activeEditor();
      if (!editor) return;
      const config = getConfig(editor.document);
      if (entry.experimental && !config.cssColorHdr) {
        logger.warnOnce(
          `hdr-disabled:${command.id}`,
          `${command.id} requires the cssColorHdr experimental switch`,
        );
        void vscode.window.showInformationMessage(
          t('diagnostic.experimentalDisabledHdr', entry.label),
        );
        return;
      }
      await convert.convertTo(editor, entry.target);
    });
  }

  // ── 隐藏的 7 个 manage 动作 ────────────────────────────────────
  register(`${COMMAND_PREFIX}.migrateLegacySettings`, async () => {
    await runMigrationCommand(logger);
  });

  register(`${COMMAND_PREFIX}.showEffectiveConfiguration`, () => {
    logger.report('effective configuration', effectiveConfigurationLines(getConfig()));
    logger.show();
  });

  register(`${COMMAND_PREFIX}.showSupportMatrix`, async () => {
    const config = getConfig();
    const document = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: renderSupportMatrix(config),
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register(`${COMMAND_PREFIX}.rescanDocument`, () => {
    const editor = activeEditor();
    if (!editor) return;
    manager.releaseDocument(editor.document);
    manager.refreshNow(editor.document);
    highlight.renderDocument(editor.document);
  });

  register(`${COMMAND_PREFIX}.clearIndexCache`, () => {
    manager.clear();
    highlight.clearAll();
    highlight.renderVisible();
  });

  register(`${COMMAND_PREFIX}.showOutputChannel`, () => {
    logger.show();
  });

  register(`${COMMAND_PREFIX}.reportUnsupportedSyntax`, () => {
    const editor = activeEditor();
    if (!editor) return;
    const document = editor.document;
    manager.ensure(document);
    const index = manager.indexOf(document);
    const offset = document.offsetAt(editor.selection.active);
    const match = index?.findAtOffset(offset);
    if (!match) {
      void vscode.window.showInformationMessage(t('ui.noColorAtCursor'));
      return;
    }
    logger.report('unsupported syntax', [
      `raw: ${match.raw}`,
      `syntax: ${match.syntax}`,
      `specLevel: ${match.specLevel}`,
      `resolution: ${match.resolution}`,
      ...match.diagnostics.map((diagnostic) => `diagnostic: ${diagnostic.code} ${diagnostic.messageKey}`),
    ]);
    logger.show();
  });

  return disposables;
}

/** 维护实验命令使用的 context key。 */
export async function syncHdrContextKey(enabled: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', HDR_CONTEXT_KEY, enabled);
}
