/**
 * 命令 id 的唯一来源。
 *
 * 分两类:
 * - 命令面板可见: 5 个入口;
 * - 隐藏: 24 个 `convertTo.*` 加 7 个 `manage` 条目, 共 31 个。
 *   隐藏只作用于命令面板 (`contributes.menus.commandPalette` 的 `when: false`),
 *   在 Keyboard Shortcuts 界面仍可搜索并绑定, 因此同样需要本地化的 title。
 *
 * 本期不声明 `contributes.keybindings`, 不内置任何默认快捷键。
 */
import { FORMAT_CATALOG } from '../features/convert/format-catalog.js';

export const COMMAND_PREFIX = 'w3cColorToolkit';

export interface CommandDefinition {
  readonly id: string;
  readonly nlsKey: string;
  readonly paletteVisible: boolean;
  /**
   * 命令面板条目的 `when`。
   *
   * NEVER 在这里使用 `editorTextFocus` / `editorFocus`:
   * 命令面板一打开焦点就离开编辑器, 这两个 context key 立即变为 false,
   * 结果是命令永远不出现在面板里。需要"有编辑器"这个条件时用 `editorIsOpen`。
   */
  readonly paletteWhen?: string;
  /** 右键子菜单条目的 `when`; 此处 `editorTextFocus` 是正确的。 */
  readonly contextWhen?: string;
  /** 需要 HDR 实验开关才允许执行。 */
  readonly requiresHdr?: boolean;
  /** 是否出现在编辑器右键子菜单中。 */
  readonly inEditorContext?: boolean;
}

/** 命令面板可见的 5 个入口。 */
export const VISIBLE_COMMANDS: readonly CommandDefinition[] = Object.freeze([
  {
    id: `${COMMAND_PREFIX}.convert`,
    nlsKey: 'command.convert',
    paletteVisible: true,
    paletteWhen: 'editorIsOpen',
    contextWhen: 'editorTextFocus',
    inEditorContext: true,
  },
  {
    id: `${COMMAND_PREFIX}.copyColorAs`,
    nlsKey: 'command.copyColorAs',
    paletteVisible: true,
    paletteWhen: 'editorIsOpen',
    contextWhen: 'editorTextFocus',
    inEditorContext: true,
  },
  {
    id: `${COMMAND_PREFIX}.toggleFeatures`,
    nlsKey: 'command.toggleFeatures',
    paletteVisible: true,
  },
  {
    id: `${COMMAND_PREFIX}.configureInfoFields`,
    nlsKey: 'command.configureInfoFields',
    paletteVisible: true,
  },
  {
    id: `${COMMAND_PREFIX}.manage`,
    nlsKey: 'command.manage',
    paletteVisible: true,
  },
]);

/** `manage` 的 7 个条目, 同时注册为隐藏命令。 */
export const MANAGE_ACTIONS: readonly {
  readonly id: string;
  readonly nlsKey: string;
  readonly labelKey: string;
}[] = Object.freeze([
  {
    id: `${COMMAND_PREFIX}.migrateLegacySettings`,
    nlsKey: 'command.migrateLegacySettings',
    labelKey: 'manage.migrate',
  },
  {
    id: `${COMMAND_PREFIX}.showEffectiveConfiguration`,
    nlsKey: 'command.showEffectiveConfiguration',
    labelKey: 'manage.showEffective',
  },
  {
    id: `${COMMAND_PREFIX}.showSupportMatrix`,
    nlsKey: 'command.showSupportMatrix',
    labelKey: 'manage.showMatrix',
  },
  {
    id: `${COMMAND_PREFIX}.rescanDocument`,
    nlsKey: 'command.rescanDocument',
    labelKey: 'manage.rescan',
  },
  {
    id: `${COMMAND_PREFIX}.clearIndexCache`,
    nlsKey: 'command.clearIndexCache',
    labelKey: 'manage.clearCache',
  },
  {
    id: `${COMMAND_PREFIX}.showOutputChannel`,
    nlsKey: 'command.showOutputChannel',
    labelKey: 'manage.showLog',
  },
  {
    id: `${COMMAND_PREFIX}.reportUnsupportedSyntax`,
    nlsKey: 'command.reportUnsupportedSyntax',
    labelKey: 'manage.reportUnsupported',
  },
]);

/** 24 个直达转换命令, 从 format catalog 生成。 */
export const CONVERT_COMMANDS: readonly CommandDefinition[] = Object.freeze(
  FORMAT_CATALOG.map((entry) => ({
    id: `${COMMAND_PREFIX}.convertTo.${entry.commandSuffix}`,
    nlsKey: `command.convertTo.${entry.commandSuffix}`,
    paletteVisible: false,
    requiresHdr: entry.experimental,
  })),
);

export const HIDDEN_COMMANDS: readonly CommandDefinition[] = Object.freeze([
  ...CONVERT_COMMANDS,
  ...MANAGE_ACTIONS.map((action) => ({
    id: action.id,
    nlsKey: action.nlsKey,
    paletteVisible: false,
  })),
]);

export const ALL_COMMANDS: readonly CommandDefinition[] = Object.freeze([
  ...VISIBLE_COMMANDS,
  ...HIDDEN_COMMANDS,
]);

/** 实验命令使用的 context key。 */
export const HDR_CONTEXT_KEY = `${COMMAND_PREFIX}.hdrEnabled`;
