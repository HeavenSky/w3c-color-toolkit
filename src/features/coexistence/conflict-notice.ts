/**
 * 与原三个扩展共存的一次性提示。
 *
 * - 只检测, 不自动禁用、卸载或修改原扩展;
 * - 每个工作区最多提示一次, "不再提示"写入 workspace state 而不改用户配置;
 * - 由 `advanced` 的 `coexistence.notify` 控制。
 */
import * as vscode from 'vscode';

import { t } from '../../l10n/strings.js';

import { LEGACY_EXTENSION_IDS } from '../migration/legacy-map.js';

const SUPPRESS_KEY = 'w3cColorToolkit.coexistenceSuppressed';

export function detectLegacyExtensions(): readonly string[] {
  return LEGACY_EXTENSION_IDS.filter((id) => vscode.extensions.getExtension(id) !== undefined);
}

export async function maybeNotifyCoexistence(
  memento: vscode.Memento & { update(key: string, value: unknown): Thenable<void> },
  notifyEnabled: boolean,
): Promise<void> {
  if (!notifyEnabled) return;
  if (memento.get<boolean>(SUPPRESS_KEY, false)) return;

  const detected = detectLegacyExtensions();
  if (detected.length === 0) return;

  // 先置位再提示, 保证同一工作区不会重复提示。
  await memento.update(SUPPRESS_KEY, true);

  const openExtensions = t('coexistence.openExtensions');
  const answer = await vscode.window.showInformationMessage(
    t('coexistence.detected', detected.join(', ')),
    openExtensions,
    t('coexistence.dontShowAgain'),
  );
  if (answer === openExtensions) {
    await vscode.commands.executeCommand('workbench.view.extensions');
  }
}
