/**
 * 多选与管理类 Quick Pick。
 *
 * - `toggleFeatures`: 多选功能开关, 一次写入, 取消零写入;
 * - `configureInfoFields`: 多选 Hover 字段, 全选且顺序未变时写回 null;
 * - `manage`: 单选进入管理动作。
 */
import * as vscode from 'vscode';

import { advancedValue } from '../configuration/advanced.js';
import type { RuntimeConfiguration } from '../configuration/load.js';
import { ADVANCED_KEY, CONFIG_SECTION } from '../configuration/schema.js';
import { DEFAULT_FIELDS, OPTIONAL_FIELDS, HDR_FIELDS, type FieldId } from '../features/info/fields.js';
import { t } from '../l10n/strings.js';

import { MANAGE_ACTIONS } from './ids.js';

/** 写入目标 scope: 有工作区时写 Workspace, 否则写 User。 */
export function preferredTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

function targetLabel(target: vscode.ConfigurationTarget): string {
  return target === vscode.ConfigurationTarget.Workspace ? 'Workspace' : 'User';
}

type ToggleId = 'highlight' | 'info' | 'convert' | 'variables' | 'cssColor6' | 'cssColorHdr';

interface ToggleItem extends vscode.QuickPickItem {
  readonly id: ToggleId;
}

/** 多选功能开关。 */
export async function runToggleFeatures(config: RuntimeConfiguration): Promise<void> {
  const target = preferredTarget();
  const writesTo = t('quickPick.writesTo', targetLabel(target));

  const items: ToggleItem[] = [
    { id: 'highlight', label: t('toggle.highlight'), detail: writesTo, picked: config.highlightEnabled },
    { id: 'info', label: t('toggle.info'), detail: writesTo, picked: config.infoEnabled },
    { id: 'convert', label: t('toggle.convert'), detail: writesTo, picked: config.convertEnabled },
    { id: 'variables', label: t('toggle.variables'), detail: writesTo, picked: config.variablesResolve },
    { id: 'cssColor6', label: t('toggle.cssColor6'), detail: writesTo, picked: config.cssColor6 },
    { id: 'cssColorHdr', label: t('toggle.cssColorHdr'), detail: writesTo, picked: config.cssColorHdr },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: t('quickPick.toggleTitle'),
  });
  if (!picked) return; // 取消: 零写入

  const selected = new Set(picked.map((item) => item.id));
  const settings = vscode.workspace.getConfiguration(CONFIG_SECTION);

  // 高亮: 关闭写 off, 打开恢复上次 marker (无历史时 background)。
  const nextHighlight = selected.has('highlight')
    ? config.markerType === 'off'
      ? 'background'
      : config.markerType
    : 'off';
  if (nextHighlight !== config.markerType) {
    await settings.update('highlight', nextHighlight, target);
  }

  if (selected.has('info') !== config.infoEnabled) {
    await settings.update('info', selected.has('info'), target);
  }

  const experimental: string[] = [];
  if (selected.has('cssColor6')) experimental.push('cssColor6');
  if (selected.has('cssColorHdr')) experimental.push('cssColorHdr');
  const currentExperimental = [
    ...(config.cssColor6 ? ['cssColor6'] : []),
    ...(config.cssColorHdr ? ['cssColorHdr'] : []),
  ];
  if (JSON.stringify(experimental) !== JSON.stringify(currentExperimental)) {
    await settings.update('experimental', experimental, target);
  }

  // convert 与 variables 属于内置层, 需要写进 advanced 且保留其他键。
  const advancedPatch: Record<string, unknown> = {};
  if (selected.has('convert') !== config.convertEnabled) {
    advancedPatch['convert.enabled'] = selected.has('convert');
  }
  if (selected.has('variables') !== config.variablesResolve) {
    advancedPatch['variables.resolve'] = selected.has('variables');
  }
  if (Object.keys(advancedPatch).length > 0) {
    await patchAdvanced(advancedPatch, target);
  }
}

/** 写入 `advanced` 时保留该 scope 已有的其他键。 */
export async function patchAdvanced(
  patch: Record<string, unknown>,
  target: vscode.ConfigurationTarget,
): Promise<void> {
  const settings = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const inspected = settings.inspect<Record<string, unknown>>(ADVANCED_KEY);
  const existing =
    target === vscode.ConfigurationTarget.Global
      ? inspected?.globalValue
      : target === vscode.ConfigurationTarget.Workspace
        ? inspected?.workspaceValue
        : inspected?.workspaceFolderValue;
  const merged = { ...(existing ?? {}), ...patch };
  await settings.update(ADVANCED_KEY, merged, target);
}

interface FieldItem extends vscode.QuickPickItem {
  readonly id: FieldId;
}

/** 多选 Hover 字段。 */
export async function runConfigureInfoFields(config: RuntimeConfiguration): Promise<void> {
  const active = new Set<string>(config.infoFields ?? DEFAULT_FIELDS);
  const excluded = new Set(config.infoExcludedFields);
  // HDR 字段已在默认表中, 实验开关关闭时把它们从列表里去掉, 避免展示不会渲染的项。
  const hdrFields = new Set<string>(HDR_FIELDS);
  const defaults = config.cssColorHdr
    ? DEFAULT_FIELDS
    : DEFAULT_FIELDS.filter((id) => !hdrFields.has(id));

  const toItem = (id: FieldId): FieldItem => ({
    id,
    label: t(`field.${id}` as Parameters<typeof t>[0]),
    description: id,
    picked: active.has(id) && !excluded.has(id),
  });

  const items: (FieldItem | vscode.QuickPickItem)[] = [
    { label: t('quickPick.defaultFields'), kind: vscode.QuickPickItemKind.Separator },
    ...defaults.map(toItem),
    { label: t('quickPick.optionalFields'), kind: vscode.QuickPickItemKind.Separator },
    ...OPTIONAL_FIELDS.map(toItem),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: t('quickPick.fieldsTitle'),
    placeHolder: t('quickPick.fieldsOrderHint'),
  });
  if (!picked) return; // 取消: 零写入

  const selected = picked
    .filter((item): item is FieldItem => 'id' in item)
    .map((item) => item.id);

  // 与默认顺序完全一致时写回 null, 保持配置文件干净。
  const isDefault =
    selected.length === DEFAULT_FIELDS.length &&
    selected.every((id, index) => id === DEFAULT_FIELDS[index]);

  await patchAdvanced({ 'info.fields': isDefault ? null : selected }, preferredTarget());
}

interface ManageItem extends vscode.QuickPickItem {
  readonly commandId: string;
}

/** 管理动作单选。 */
export async function runManage(): Promise<void> {
  const items: ManageItem[] = MANAGE_ACTIONS.map((action) => ({
    label: t(action.labelKey as Parameters<typeof t>[0]),
    commandId: action.id,
  }));
  const picked = await vscode.window.showQuickPick(items, { title: t('quickPick.manageTitle') });
  if (!picked) return;
  await vscode.commands.executeCommand(picked.commandId);
}

/** 生效配置报告的文本行。 */
export function effectiveConfigurationLines(config: RuntimeConfiguration): string[] {
  const lines: string[] = [
    `enabled = ${config.enabled}`,
    `languages = ${JSON.stringify(config.languages)}`,
    `highlight = ${config.markerType}`,
    `info = ${config.infoEnabled}`,
    `convertSyntax = ${config.convertSyntax}`,
    `precision = ${config.precision}`,
    `experimental = ${JSON.stringify([
      ...(config.cssColor6 ? ['cssColor6'] : []),
      ...(config.cssColorHdr ? ['cssColorHdr'] : []),
    ])}`,
    '--- advanced ---',
  ];

  for (const [key, source] of Object.entries(config.advanced.sources)) {
    const value = advancedValue<unknown>(config.advanced, key);
    lines.push(`${key} = ${JSON.stringify(value)}  [${source}]`);
  }

  if (config.advanced.issues.length > 0) {
    lines.push('--- issues ---');
    for (const issue of config.advanced.issues) {
      lines.push(`${issue.kind}: ${issue.key} (${issue.scope})${issue.detail ? ` ${issue.detail}` : ''}`);
    }
  }
  return lines;
}
