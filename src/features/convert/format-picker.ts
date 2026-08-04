/**
 * 二级 Quick Pick: 第一级选分类, 第二级选具体格式。
 *
 * - "最近使用"分组置顶, 使高频路径仍是一步选择;
 * - 第二级首项固定为"返回上一级";
 * - HDR 分类只在实验开关开启时出现;
 * - 第二级每项显示预览文本、色域映射与信息损失。
 */
import * as vscode from 'vscode';

import type { RuntimeConfiguration } from '../../configuration/load.js';
import type { TargetFormat } from '../../core/serializer.js';
import type { ResolvedColor, SerializerOptions } from '../../core/types.js';
import { t } from '../../l10n/strings.js';

import {
  FORMAT_CATALOG,
  FORMAT_CATEGORIES,
  formatByTarget,
  formatsInCategory,
  type FormatEntry,
} from './format-catalog.js';
import { isRejection, previewConversion, type ConvertPolicy } from './presentations.js';

const RECENT_KEY = 'w3cColorToolkit.recentTargets';
const MAX_RECENT = 5;

export interface RecentStore {
  get(): readonly TargetFormat[];
  push(target: TargetFormat): Promise<void>;
}

/** 最近使用列表存 workspace state, 不写用户配置。 */
export function createRecentStore(memento: vscode.Memento): RecentStore {
  return {
    get(): readonly TargetFormat[] {
      return memento.get<TargetFormat[]>(RECENT_KEY, []);
    },
    async push(target: TargetFormat): Promise<void> {
      const current = memento.get<TargetFormat[]>(RECENT_KEY, []).filter((item) => item !== target);
      current.unshift(target);
      await memento.update(RECENT_KEY, current.slice(0, MAX_RECENT));
    },
  };
}

/** 分隔符条目没有 `target`, 因此该字段可选。 */
export interface TargetItem extends vscode.QuickPickItem {
  readonly target?: TargetFormat;
}

function describeEntry(
  entry: FormatEntry,
  resolved: ResolvedColor,
  options: SerializerOptions,
  policy: ConvertPolicy,
  currentSpace: string,
): TargetItem {
  const preview = previewConversion(resolved, entry.target, options, policy);
  const notes: string[] = [];
  let description: string;

  if (isRejection(preview)) {
    description = '—';
    notes.push(rejectionNote(preview.rejection.kind));
  } else {
    description = preview.serialized.text;
    if (preview.serialized.gamutMapped) notes.push(t('ui.gamutMapped'));
    if (preview.serialized.alphaLost) notes.push(t('diagnostic.alphaLoss'));
    if (preview.serialized.missingComponentsLost) notes.push(t('diagnostic.missingComponentLoss'));
    if (preview.serialized.hdrToneMapped) notes.push(t('ui.hdrToneMapped'));
  }

  const isCurrent = entry.target !== 'named-color' && description === currentSpace;
  if (isCurrent) notes.push(t('ui.noChange'));

  return {
    label: entry.label,
    description,
    detail: notes.length > 0 ? notes.join(' · ') : undefined,
    target: entry.target,
  };
}

function rejectionNote(kind: string): string {
  switch (kind) {
    case 'alpha-loss':
      return t('diagnostic.alphaLoss');
    case 'named-color-no-exact-match':
      return t('convert.rejectedNamedColor');
    default:
      return t('ui.unknown');
  }
}

export interface PickFormatOptions {
  readonly titleKey: 'quickPick.convertTitle' | 'quickPick.copyTitle';
  readonly resolved: ResolvedColor;
  readonly serializerOptions: SerializerOptions;
  readonly policy: ConvertPolicy;
  readonly config: RuntimeConfiguration;
  readonly recent: RecentStore;
  /** 当前源文本, 用于标注"无变化"。 */
  readonly currentText: string;
}

/**
 * 构造一级 Quick Pick 的条目列表。
 *
 * 所有目标格式平铺在同一层, 用 `QuickPickItemKind.Separator` 按分类分组。
 * 这样既保留了分类的可浏览性, 又让输入过滤能一次命中全部 24 个目标 ——
 * 二级菜单会把过滤范围限制在当前分类内, 反而更难找。
 */
export function buildTargetItems(options: PickFormatOptions): TargetItem[] {
  const items: TargetItem[] = [];
  const describe = (entry: FormatEntry): TargetItem =>
    describeEntry(
      entry,
      options.resolved,
      options.serializerOptions,
      options.policy,
      options.currentText,
    );

  // "最近使用"置顶, 使高频路径不需要翻找。
  const recent = options.config.recentFirst ? options.recent.get() : [];
  const visibleRecent = recent
    .map((target) => formatByTarget(target))
    .filter((entry): entry is FormatEntry => entry !== undefined)
    .filter((entry) => !entry.experimental || options.config.cssColorHdr);

  if (visibleRecent.length > 0) {
    items.push({ label: t('ui.recentlyUsed'), kind: vscode.QuickPickItemKind.Separator });
    for (const entry of visibleRecent) items.push(describe(entry));
  }

  for (const category of FORMAT_CATEGORIES) {
    if (category.experimental && !options.config.cssColorHdr) continue;
    const entries = formatsInCategory(category.id).filter(
      (entry) => !entry.experimental || options.config.cssColorHdr,
    );
    if (entries.length === 0) continue;
    items.push({
      label: t(category.nlsKey as Parameters<typeof t>[0]),
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const entry of entries) items.push(describe(entry));
  }

  return items;
}

/** 显示一级分组 Quick Pick 并返回选中的目标格式。 */
export async function pickTargetFormat(
  options: PickFormatOptions,
): Promise<TargetFormat | undefined> {
  const title = t(options.titleKey);
  const picked = await vscode.window.showQuickPick(buildTargetItems(options), {
    title,
    placeHolder: title,
    // 目标格式名在 label, 转换后预览在 description, 两者都参与过滤。
    matchOnDescription: true,
  });
  return picked?.target;
}

export { FORMAT_CATALOG };
