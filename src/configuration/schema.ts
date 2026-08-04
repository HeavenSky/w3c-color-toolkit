/**
 * 配置的唯一来源。
 *
 * 分两层:
 * - 暴露层: 8 个键, 在 `contributes.configuration` 中完整声明并出现在设置界面;
 * - 内置层: 34 项, 只有默认值, 通过 `w3cColorToolkit.advanced` 对象增量覆盖。
 *
 * `package.json` 的 `contributes.configuration` 由 `scripts/gen-contributes.mjs`
 * 从本文件生成, 并由 `test/unit/contributes.test.ts` 断言一致。
 */

export const CONFIG_SECTION = 'w3cColorToolkit';
export const ADVANCED_KEY = 'advanced';

export type SettingType = 'boolean' | 'string' | 'number' | 'integer' | 'string[]' | 'string[]|null';

export interface SettingDefinition {
  /** 不含 `w3cColorToolkit.` 前缀的键名。 */
  readonly key: string;
  readonly type: SettingType;
  readonly default: unknown;
  /** 枚举取值; `string` 类型可选。 */
  readonly enum?: readonly string[];
  /** 数值范围。 */
  readonly minimum?: number;
  readonly maximum?: number;
  /** nls key, 不含百分号。 */
  readonly nlsKey: string;
}

/** 暴露层: 出现在设置界面的 8 个键。 */
export const EXPOSED_SETTINGS: readonly SettingDefinition[] = Object.freeze([
  {
    key: 'enabled',
    type: 'boolean',
    default: true,
    nlsKey: 'config.enabled',
  },
  {
    key: 'languages',
    type: 'string[]',
    default: ['*'],
    nlsKey: 'config.languages',
  },
  {
    key: 'highlight',
    type: 'string',
    default: 'underline',
    enum: ['off', 'background', 'foreground', 'outline', 'underline', 'dot-before', 'dot-after'],
    nlsKey: 'config.highlight',
  },
  {
    key: 'info',
    type: 'boolean',
    default: true,
    nlsKey: 'config.info',
  },
  {
    key: 'convertSyntax',
    type: 'string',
    default: 'legacy',
    enum: ['modern', 'legacy'],
    nlsKey: 'config.convertSyntax',
  },
  {
    key: 'precision',
    type: 'integer',
    default: 5,
    minimum: 1,
    maximum: 10,
    nlsKey: 'config.precision',
  },
  {
    key: 'experimental',
    type: 'string[]',
    // 默认开启两项草案支持。注意这与"草案可能变化"的风险并存:
    // Color 6 规范自述尚未准备实现, HDR 的百分比参考值仍是假设值。
    default: ['cssColor6', 'cssColorHdr'],
    enum: ['cssColor6', 'cssColorHdr'],
    nlsKey: 'config.experimental',
  },
  {
    key: ADVANCED_KEY,
    type: 'string',
    default: {},
    nlsKey: 'config.advanced',
  },
]);

/** 内置层: 只能通过 `advanced` 覆盖的 34 项。 */
export const ADVANCED_SETTINGS: readonly SettingDefinition[] = Object.freeze([
  // 高亮 (9)
  { key: 'highlight.markRuler', type: 'boolean', default: true, nlsKey: 'advanced.highlight.markRuler' },
  {
    key: 'highlight.matchWords',
    type: 'string',
    default: 'css-like',
    enum: ['off', 'css-like', 'all'],
    nlsKey: 'advanced.highlight.matchWords',
  },
  {
    key: 'highlight.hexAlphaOrder',
    type: 'string',
    default: 'rgba',
    enum: ['rgba', 'argb'],
    nlsKey: 'advanced.highlight.hexAlphaOrder',
  },
  {
    key: 'highlight.matchRgbWithoutFunction',
    type: 'boolean',
    default: false,
    nlsKey: 'advanced.highlight.matchRgbWithoutFunction',
  },
  {
    key: 'highlight.rgbWithoutFunctionLanguages',
    type: 'string[]',
    default: ['*'],
    nlsKey: 'advanced.highlight.rgbWithoutFunctionLanguages',
  },
  {
    key: 'highlight.matchHslWithoutFunction',
    type: 'boolean',
    default: false,
    nlsKey: 'advanced.highlight.matchHslWithoutFunction',
  },
  {
    key: 'highlight.hslWithoutFunctionLanguages',
    type: 'string[]',
    default: ['*'],
    nlsKey: 'advanced.highlight.hslWithoutFunctionLanguages',
  },
  {
    key: 'highlight.maxMatchesPerDocument',
    type: 'integer',
    default: 10000,
    minimum: 1,
    maximum: 1000000,
    nlsKey: 'advanced.highlight.maxMatchesPerDocument',
  },
  {
    key: 'highlight.hdrToneMapping',
    type: 'string',
    default: 'reinhard',
    enum: ['none', 'reinhard', 'clip'],
    nlsKey: 'advanced.highlight.hdrToneMapping',
  },

  // Hover (6)
  { key: 'info.fields', type: 'string[]|null', default: null, nlsKey: 'advanced.info.fields' },
  { key: 'info.excludedFields', type: 'string[]', default: [], nlsKey: 'advanced.info.excludedFields' },
  {
    key: 'info.previewSize',
    type: 'string',
    default: 'small',
    enum: ['small', 'large'],
    nlsKey: 'advanced.info.previewSize',
  },
  {
    key: 'info.previewShape',
    type: 'string',
    default: 'rectangle',
    enum: ['square', 'rectangle'],
    nlsKey: 'advanced.info.previewShape',
  },
  { key: 'info.showDiagnostics', type: 'boolean', default: true, nlsKey: 'advanced.info.showDiagnostics' },
  // 默认字段表包含 `spec-level`, 因此该开关必须同为 true, 否则字段在列表里却不渲染。
  { key: 'info.showSpecLevel', type: 'boolean', default: true, nlsKey: 'advanced.info.showSpecLevel' },

  // 转换 (5)
  { key: 'convert.enabled', type: 'boolean', default: true, nlsKey: 'advanced.convert.enabled' },
  {
    key: 'convert.alphaLoss',
    type: 'string',
    default: 'reject',
    enum: ['reject', 'confirm', 'drop'],
    nlsKey: 'advanced.convert.alphaLoss',
  },
  {
    key: 'convert.missingComponentLoss',
    type: 'string',
    default: 'confirm',
    enum: ['confirm', 'compute'],
    nlsKey: 'advanced.convert.missingComponentLoss',
  },
  {
    key: 'convert.namedColorFallback',
    type: 'string',
    default: 'reject',
    enum: ['reject', 'nearest'],
    nlsKey: 'advanced.convert.namedColorFallback',
  },
  { key: 'convert.recentFirst', type: 'boolean', default: true, nlsKey: 'advanced.convert.recentFirst' },

  // 输出与扫描 (6)
  {
    key: 'output.gamutMapping',
    type: 'string',
    default: 'css',
    enum: ['css', 'clip', 'none'],
    nlsKey: 'advanced.output.gamutMapping',
  },
  {
    key: 'output.hexCase',
    type: 'string',
    default: 'lower',
    enum: ['lower', 'upper'],
    nlsKey: 'advanced.output.hexCase',
  },
  { key: 'scan.comments', type: 'boolean', default: true, nlsKey: 'advanced.scan.comments' },
  { key: 'scan.strings', type: 'boolean', default: true, nlsKey: 'advanced.scan.strings' },
  {
    key: 'scan.maxDocumentSizeKb',
    type: 'integer',
    default: 2048,
    minimum: 1,
    maximum: 102400,
    nlsKey: 'advanced.scan.maxDocumentSizeKb',
  },
  {
    key: 'contextualPreview',
    type: 'string',
    default: 'off',
    enum: ['off', 'light', 'dark'],
    nlsKey: 'advanced.contextualPreview',
  },

  // 变量 (5)
  { key: 'variables.resolve', type: 'boolean', default: true, nlsKey: 'advanced.variables.resolve' },
  {
    key: 'variables.includePaths',
    type: 'string[]',
    default: [],
    nlsKey: 'advanced.variables.includePaths',
  },
  {
    key: 'variables.maxImportDepth',
    type: 'integer',
    default: 20,
    minimum: 0,
    maximum: 100,
    nlsKey: 'advanced.variables.maxImportDepth',
  },
  {
    key: 'variables.maxImportFiles',
    type: 'integer',
    default: 200,
    minimum: 0,
    maximum: 10000,
    nlsKey: 'advanced.variables.maxImportFiles',
  },
  {
    key: 'variables.maxResolveDepth',
    type: 'integer',
    default: 20,
    minimum: 1,
    maximum: 100,
    nlsKey: 'advanced.variables.maxResolveDepth',
  },

  // 实验与其他 (3)
  {
    key: 'experimental.hdrAssumedHeadroom',
    type: 'number',
    default: 0,
    minimum: 0,
    maximum: 10,
    nlsKey: 'advanced.experimental.hdrAssumedHeadroom',
  },
  { key: 'coexistence.notify', type: 'boolean', default: true, nlsKey: 'advanced.coexistence.notify' },
  {
    key: 'logLevel',
    type: 'string',
    default: 'warn',
    enum: ['off', 'error', 'warn', 'info', 'debug'],
    nlsKey: 'advanced.logLevel',
  },
]);

export const EXPOSED_KEYS: readonly string[] = Object.freeze(EXPOSED_SETTINGS.map((s) => s.key));
export const ADVANCED_KEYS: readonly string[] = Object.freeze(ADVANCED_SETTINGS.map((s) => s.key));

const advancedByKey = new Map(ADVANCED_SETTINGS.map((setting) => [setting.key, setting]));
const exposedByKey = new Map(EXPOSED_SETTINGS.map((setting) => [setting.key, setting]));

export function advancedSetting(key: string): SettingDefinition | undefined {
  return advancedByKey.get(key);
}

export function isExposedKey(key: string): boolean {
  return exposedByKey.has(key);
}

/** 内置层的完整默认值。 */
export function advancedDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const setting of ADVANCED_SETTINGS) defaults[setting.key] = setting.default;
  return defaults;
}
