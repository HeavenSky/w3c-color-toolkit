/**
 * 旧配置迁移。
 *
 * 保证:
 * - 只迁移显式值 (用 `inspect()` 区分显式值与默认值);
 * - User / Workspace / WorkspaceFolder 分别写回对应 scope, 不把工作区设置提升为用户设置;
 * - 写入 `advanced` 时保留该 scope 已有的其他 `advanced` 键;
 * - 与内置默认值相同的项不写入, 避免噪音配置;
 * - 用户确认后才写入, 取消时零写入;
 * - 目标已有显式值时默认跳过;
 * - 不修改或删除旧配置; 命令可重复执行且幂等。
 */
import * as vscode from 'vscode';

import { advancedDefaults } from '../../configuration/schema.js';
import { ADVANCED_KEY, CONFIG_SECTION } from '../../configuration/schema.js';
import { t } from '../../l10n/strings.js';
import type { Logger } from '../../logging/output-channel.js';

import {
  collapsePreviewFields,
  collectColorInfoLanguages,
  COLOR_HIGHLIGHT_MAPPINGS,
  mergeHighlight,
  type TargetTier,
} from './legacy-map.js';

type Scope = 'user' | 'workspace' | 'folder';

const SCOPES: readonly Scope[] = ['user', 'workspace', 'folder'];

const CONFIG_TARGET: Readonly<Record<Scope, vscode.ConfigurationTarget>> = {
  user: vscode.ConfigurationTarget.Global,
  workspace: vscode.ConfigurationTarget.Workspace,
  folder: vscode.ConfigurationTarget.WorkspaceFolder,
};

export interface PlannedWrite {
  readonly legacyKey: string;
  readonly legacyValue: unknown;
  readonly targetKey: string;
  readonly tier: TargetTier;
  readonly value: unknown;
  readonly scope: Scope;
  readonly overwritesExisting: boolean;
}

export interface SkippedWrite {
  readonly legacyKey: string;
  readonly reason: 'same-as-default' | 'target-already-set' | 'no-target';
  readonly detail?: string;
}

export interface MigrationPlan {
  readonly writes: readonly PlannedWrite[];
  readonly skipped: readonly SkippedWrite[];
}

function explicitValue(section: string, key: string, scope: Scope): unknown {
  const config = vscode.workspace.getConfiguration(section);
  const inspected = config.inspect(key);
  if (!inspected) return undefined;
  switch (scope) {
    case 'user':
      return inspected.globalValue;
    case 'workspace':
      return inspected.workspaceValue;
    case 'folder':
      return inspected.workspaceFolderValue;
    default:
      return undefined;
  }
}

function targetHasExplicitValue(key: string, tier: TargetTier, scope: Scope): boolean {
  if (tier === 'exposed') return explicitValue(CONFIG_SECTION, key, scope) !== undefined;
  const advanced = explicitValue(CONFIG_SECTION, ADVANCED_KEY, scope);
  if (typeof advanced !== 'object' || advanced === null) return false;
  return key in (advanced as Record<string, unknown>);
}

function sameAsDefault(key: string, tier: TargetTier, value: unknown): boolean {
  if (tier === 'advanced') {
    const defaults = advancedDefaults();
    return JSON.stringify(defaults[key]) === JSON.stringify(value);
  }
  const inspected = vscode.workspace.getConfiguration(CONFIG_SECTION).inspect(key);
  return JSON.stringify(inspected?.defaultValue) === JSON.stringify(value);
}

/** 生成迁移计划; 不做任何写入。 */
export function planMigration(): MigrationPlan {
  const writes: PlannedWrite[] = [];
  const skipped: SkippedWrite[] = [];

  const push = (
    legacyKey: string,
    legacyValue: unknown,
    targetKey: string,
    tier: TargetTier,
    value: unknown,
    scope: Scope,
  ): void => {
    if (value === undefined) {
      skipped.push({ legacyKey, reason: 'no-target' });
      return;
    }
    if (sameAsDefault(targetKey, tier, value)) {
      skipped.push({ legacyKey, reason: 'same-as-default' });
      return;
    }
    const overwritesExisting = targetHasExplicitValue(targetKey, tier, scope);
    if (overwritesExisting) {
      skipped.push({ legacyKey, reason: 'target-already-set', detail: targetKey });
      return;
    }
    writes.push({ legacyKey, legacyValue, targetKey, tier, value, scope, overwritesExisting });
  };

  for (const scope of SCOPES) {
    // enable + markerType 合并
    const enable = explicitValue('color-highlight', 'enable', scope);
    const markerType = explicitValue('color-highlight', 'markerType', scope);
    if (enable !== undefined || markerType !== undefined) {
      const merged = mergeHighlight(enable, markerType);
      push(
        'color-highlight.enable + markerType',
        { enable, markerType },
        'highlight',
        'exposed',
        merged,
        scope,
      );
    }

    for (const mapping of COLOR_HIGHLIGHT_MAPPINGS) {
      const [section, ...rest] = mapping.legacyKey.split('.');
      const key = rest.join('.');
      const value = explicitValue(section, key, scope);
      if (value === undefined) continue;
      const transformed = mapping.transform ? mapping.transform(value) : value;
      push(mapping.legacyKey, value, mapping.targetKey, mapping.tier, transformed, scope);
    }

    // colorInfo.fields / excludedFields: 折叠 preview 变体
    for (const [legacyKey, targetKey] of [
      ['colorInfo.fields', 'info.fields'],
      ['colorInfo.excludedFields', 'info.excludedFields'],
    ] as const) {
      const value = explicitValue('colorInfo', legacyKey.split('.')[1], scope);
      if (!Array.isArray(value)) continue;
      const collapsed = collapsePreviewFields(value.filter((item): item is string => typeof item === 'string'));
      push(legacyKey, value, targetKey, 'advanced', collapsed.fields, scope);
      if (collapsed.collapsed) {
        push(legacyKey, value, 'info.previewSize', 'advanced', collapsed.previewSize, scope);
        push(legacyKey, value, 'info.previewShape', 'advanced', collapsed.previewShape, scope);
      }
    }

    // colorInfo.languages: 取 selector 去重
    const languages = explicitValue('colorInfo', 'languages', scope);
    if (languages !== undefined) {
      const { selectors, ignoredColorsField } = collectColorInfoLanguages(languages);
      if (selectors.length > 0) {
        push('colorInfo.languages', languages, 'languages', 'exposed', selectors, scope);
      }
      if (ignoredColorsField) {
        skipped.push({
          legacyKey: 'colorInfo.languages#colors',
          reason: 'no-target',
          detail: 'colors',
        });
      }
    }
  }

  return { writes, skipped };
}

function renderPlan(plan: MigrationPlan): string[] {
  const lines = plan.writes.map(
    (write) =>
      `${write.legacyKey} = ${JSON.stringify(write.legacyValue)} → ${
        write.tier === 'advanced' ? `advanced.${write.targetKey}` : write.targetKey
      } = ${JSON.stringify(write.value)} [${write.scope}]`,
  );
  for (const item of plan.skipped) {
    const reason =
      item.reason === 'same-as-default'
        ? t('migration.skippedDefault')
        : item.reason === 'target-already-set'
          ? t('migration.skippedExisting')
          : t('migration.skippedNoTarget', item.detail ?? '');
    lines.push(`${item.legacyKey}: ${reason}`);
  }
  return lines;
}

/** 应用迁移计划。写入 `advanced` 时保留该 scope 已有的其他键。 */
export async function applyMigration(plan: MigrationPlan): Promise<number> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  let written = 0;

  for (const scope of SCOPES) {
    const target = CONFIG_TARGET[scope];
    const scopeWrites = plan.writes.filter((write) => write.scope === scope);
    if (scopeWrites.length === 0) continue;

    // 先合并同一 scope 的全部 advanced 键, 只写一次。
    const advancedWrites = scopeWrites.filter((write) => write.tier === 'advanced');
    if (advancedWrites.length > 0) {
      const existing = explicitValue(CONFIG_SECTION, ADVANCED_KEY, scope);
      const merged: Record<string, unknown> =
        typeof existing === 'object' && existing !== null
          ? { ...(existing as Record<string, unknown>) }
          : {};
      for (const write of advancedWrites) merged[write.targetKey] = write.value;
      await config.update(ADVANCED_KEY, merged, target);
      written += advancedWrites.length;
    }

    for (const write of scopeWrites.filter((item) => item.tier === 'exposed')) {
      await config.update(write.targetKey, write.value, target);
      written += 1;
    }
  }
  return written;
}

/** 迁移命令: 预览 → 确认 → 写入。 */
export async function runMigrationCommand(logger: Logger): Promise<void> {
  const plan = planMigration();
  logger.report(t('migration.previewTitle'), renderPlan(plan));

  if (plan.writes.length === 0) {
    void vscode.window.showInformationMessage(t('migration.nothingToMigrate'));
    logger.show();
    return;
  }

  const answer = await vscode.window.showInformationMessage(
    `${t('migration.previewTitle')}:\n${renderPlan(plan).slice(0, 10).join('\n')}`,
    { modal: true },
    t('migration.apply'),
  );
  if (answer !== t('migration.apply')) return;

  const written = await applyMigration(plan);
  void vscode.window.showInformationMessage(t('migration.done', written));
}
