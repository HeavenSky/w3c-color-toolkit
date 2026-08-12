/**
 * 配置的唯一来源。
 *
 * 分两层:
 * - 暴露层: 7 个键, 在 `contributes.configuration` 中完整声明并出现在设置界面;
 * - 内置层: 33 项, 只有默认值, 通过 `w3cColorToolkit.advanced` 对象增量覆盖。
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

/** 暴露层: 出现在设置界面的 7 个键。 */
export const EXPOSED_SETTINGS: readonly SettingDefinition[] = Object.freeze([
  {
    key: 'enabled',
    type: 'boolean',
    default: true,
    nlsKey: 'config.enabled',
  },
  {
    key: 'highlight',
    type: 'string',
    default: 'underline',
    enum: [
      'off',
      'background',
      'foreground',
      'outline',
      'underline',
      'dot-before',
      'dot-after',
      'square-before',
      'square-after',
    ],
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
    default: 3,
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

/** 内置层: 只能通过 `advanced` 覆盖的 33 项。 */
export const ADVANCED_SETTINGS: readonly SettingDefinition[] = Object.freeze([
  // 隐身 (3): 三条件是或关系, 任一命中就完全不介入该文件。
  // 三项必须连续, 否则生成的参考表会重复出现同一个分组标题。
  {
    key: 'disable.maxFileSizeMb',
    type: 'number',
    // 0.3 MB (= 314573 码元 ≈ 307 KiB): 取"编辑体验不卡"而不是"极端文件不崩"。
    // 注意单位是 UTF-16 码元, 纯中文文件的磁盘尺寸约为码元数的 3 倍,
    // 因此实际能放过的中文文件更大。
    default: 0.3,
    minimum: 0,
    maximum: 1024,
    nlsKey: 'advanced.disable.maxFileSizeMb',
  },
  // 默认值不是空数组: 压缩产物与 source map 里的颜色对人没有意义, 开箱就该躲开。
  {
    key: 'disable.fileNames',
    type: 'string[]',
    default: ['*.min.*', '*.map'],
    nlsKey: 'advanced.disable.fileNames',
  },
  {
    key: 'disable.languageIds',
    type: 'string[]',
    default: ['log', 'plaintext'],
    nlsKey: 'advanced.disable.languageIds',
  },

  // 高亮 (5)
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
    key: 'highlight.maxMatchesPerDocument',
    type: 'integer',
    default: 600,
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

  // 原生色块与取色器 (1)
  {
    key: 'colorPicker.mode',
    type: 'string',
    // `dedupe`: 在内置 CSS 提供器覆盖的 css/less/scss 里探测一次, 只补它没覆盖的 range;
    // 其他语言全量提供 (那里唯一可能重叠的内置默认提供器会自动让位)。
    default: 'dedupe',
    enum: ['off', 'dedupe', 'all'],
    nlsKey: 'advanced.colorPicker.mode',
  },

  // 字段范围 (2): 同时决定 Hover 行与高亮的颜色语法范围。
  { key: 'fields.enabled', type: 'string[]|null', default: null, nlsKey: 'advanced.fields.enabled' },
  { key: 'fields.excluded', type: 'string[]', default: [], nlsKey: 'advanced.fields.excluded' },

  // Hover (4)
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

  // 输出与扫描 (5)
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
    key: 'contextualPreview',
    type: 'string',
    // `auto` 跟随编辑器主题, 使 `light-dark()` 默认就能得到预览色;
    // 结果在 Hover 中始终标注为假设值, 因此不构成"猜测成具体颜色"。
    default: 'auto',
    enum: ['off', 'auto', 'light', 'dark'],
    nlsKey: 'advanced.contextualPreview',
  },

  // 变量 (5)
  { key: 'variables.resolve', type: 'boolean', default: true, nlsKey: 'advanced.variables.resolve' },
  // 发现范围以 glob 为主: 现实项目的样式文件常常只经 JS/TS 的 import 合并, 没有任何
  // CSS 层面的 `@import`, 只跟导入图会永远看不到令牌文件。`@import` 仍作补充路径。
  {
    key: 'variables.lookupGlobs',
    type: 'string[]',
    default: ['**/*.{css,scss,sass,less}'],
    nlsKey: 'advanced.variables.lookupGlobs',
  },
  {
    key: 'variables.maxIndexedFiles',
    type: 'integer',
    default: 2000,
    minimum: 0,
    maximum: 100000,
    nlsKey: 'advanced.variables.maxIndexedFiles',
  },
  // 与 `highlight.matchWords` 的语言判定分开: 那个决定"裸颜色名在哪些语言里算颜色",
  // 这个决定"在哪些语言里识别变量引用"。含 tailwindcss, 不含 stylus。
  {
    key: 'variables.languageIds',
    type: 'string[]|null',
    default: null,
    nlsKey: 'advanced.variables.languageIds',
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
