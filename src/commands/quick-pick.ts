/**
 * 多选与管理类 Quick Pick。
 *
 * - `toggleFeatures`: 多选功能开关, 一次写入, 取消零写入;
 * - `configureColorFields`: 多选颜色字段 (同时决定 Hover 行与高亮语法),
 *   全选且顺序未变时写回 null;
 * - `manage`: 单选进入管理动作。
 */
import * as vscode from 'vscode';

import { advancedValue } from '../configuration/advanced.js';
import type { RuntimeConfiguration } from '../configuration/load.js';
import { ADVANCED_KEY, CONFIG_SECTION } from '../configuration/schema.js';
import {
  DEFAULT_FIELDS,
  FIELDS,
  type FieldDefinition,
  type FieldGroup,
  type FieldId,
} from '../features/fields/registry.js';
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

type ToggleId =
  | 'highlight'
  | 'colorPicker'
  | 'info'
  | 'convert'
  | 'variables'
  | 'cssColor6'
  | 'cssColorHdr';

interface ToggleItem extends vscode.QuickPickItem {
  readonly id: ToggleId;
}

/** 多选功能开关。 */
export async function runToggleFeatures(config: RuntimeConfiguration): Promise<void> {
  const target = preferredTarget();
  const writesTo = t('quickPick.writesTo', targetLabel(target));

  const items: ToggleItem[] = [
    { id: 'highlight', label: t('toggle.highlight'), detail: writesTo, picked: config.highlightEnabled },
    {
      id: 'colorPicker',
      label: t('toggle.colorPicker'),
      detail: writesTo,
      picked: config.colorPickerMode !== 'off',
    },
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
  // 色块: 关闭写 off, 打开恢复默认的 dedupe (避免与内置 CSS 提供器重复)。
  const nextColorPicker = selected.has('colorPicker')
    ? config.colorPickerMode === 'off'
      ? 'dedupe'
      : config.colorPickerMode
    : 'off';
  if (nextColorPicker !== config.colorPickerMode) {
    advancedPatch['colorPicker.mode'] = nextColorPicker;
  }
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

/** 分节标题: 同时告诉用户该组作用在 Hover 还是高亮。 */
const GROUP_LABEL: Readonly<Record<FieldGroup, Parameters<typeof t>[0]>> = Object.freeze({
  'css-format': 'quickPick.fieldGroupCssFormat',
  'css-syntax': 'quickPick.fieldGroupCssSyntax',
  'non-css-format': 'quickPick.fieldGroupNonCss',
  meta: 'quickPick.fieldGroupMeta',
});

const GROUP_ORDER: readonly FieldGroup[] = Object.freeze([
  'css-format',
  'css-syntax',
  'non-css-format',
  'meta',
]);

/** 条目副标题: 生效范围 + 是否默认关闭 + 是否不构成完整颜色。 */
function fieldDetail(field: FieldDefinition): string {
  const parts = [
    field.scope === 'both'
      ? t('quickPick.fieldScopeBoth')
      : field.scope === 'highlight'
        ? t('quickPick.fieldScopeHighlight')
        : t('quickPick.fieldScopeHover'),
  ];
  if (field.group === 'meta') parts.push(t('quickPick.fieldNotAColor'));
  if (field.optional) parts.push(t('quickPick.fieldDefaultOff'));
  return parts.join(' · ');
}

/**
 * 多选颜色字段。
 *
 * 同一份选择同时收窄 Hover 行与高亮语法, 因此不再有"高亮范围"这第二处配置。
 */
export async function runConfigureColorFields(config: RuntimeConfiguration): Promise<void> {
  const active = new Set<string>(config.fields ?? DEFAULT_FIELDS);
  const excluded = new Set(config.excludedFields);
  // HDR 字段实验开关关闭时不展示, 避免勾选了却不生效。
  const visible = FIELDS.filter((field) => !field.hdr || config.cssColorHdr);

  const items: (FieldItem | vscode.QuickPickItem)[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = visible.filter((field) => field.group === group);
    if (inGroup.length === 0) continue;
    items.push({ label: t(GROUP_LABEL[group]), kind: vscode.QuickPickItemKind.Separator });
    for (const field of inGroup) {
      items.push({
        id: field.id,
        label: t(`field.${field.id}` as Parameters<typeof t>[0]),
        description: field.id,
        detail: fieldDetail(field),
        picked: active.has(field.id) && !excluded.has(field.id),
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: t('quickPick.fieldsTitle'),
    placeHolder: t('quickPick.fieldsOrderHint'),
  });
  if (!picked) return; // 取消: 零写入

  const chosen = new Set<string>(
    picked.filter((item): item is FieldItem => 'id' in item).map((item) => item.id),
  );
  // HDR 开关关闭时列表里没有 HDR 字段, 保留原有取值, 避免关一次开关就永久丢掉它们。
  for (const field of FIELDS) {
    if (field.hdr && !config.cssColorHdr && active.has(field.id) && !excluded.has(field.id)) {
      chosen.add(field.id);
    }
  }

  // 始终按注册表顺序写入: Quick Pick 的返回顺序是分组顺序, 直接写会把预览色块挤到最后。
  // 自定义顺序请直接编辑 `fields.enabled` (placeHolder 里有提示)。
  const selected = FIELDS.filter((field) => chosen.has(field.id)).map((field) => field.id);

  // 与默认顺序完全一致时写回 null, 保持配置文件干净。
  const isDefault =
    selected.length === DEFAULT_FIELDS.length &&
    selected.every((id, index) => id === DEFAULT_FIELDS[index]);

  const patch: Record<string, unknown> = { 'fields.enabled': isDefault ? null : selected };
  // 勾选一个被 `fields.excluded` 排除的字段时同时解除排除, 否则勾选不生效。
  const nextExcluded = config.excludedFields.filter((id) => !chosen.has(id));
  if (nextExcluded.length !== config.excludedFields.length) {
    patch['fields.excluded'] = nextExcluded;
  }
  await patchAdvanced(patch, preferredTarget());
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
