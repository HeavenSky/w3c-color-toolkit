/**
 * `package.nls.json` 与 `package.nls.zh-cn.json` 的文案来源。
 *
 * 本期只交付英语与简体中文; 英语是默认回退语言。
 * 键必须与 `src/configuration/schema.ts`、`src/commands/ids.ts` 中的 nlsKey 完全一致,
 * 由 `scripts/gen-contributes.mjs --check` 断言。
 */

export const EN = {
  'extension.displayName': 'W3C Color Toolkit',
  'extension.description':
    'Color highlighting, hover information and format conversion with CSS Color 4/5/6 and HDR support.',
  'capabilities.untrustedWorkspaces':
    'In untrusted workspaces, variables are only resolved inside the current document; imported files are not read.',

  // 暴露层配置
  'config.enabled': 'Enable W3C Color Toolkit.',
  'config.languages':
    'Languages to process. Use a language id, "*" for all, or "!id" to exclude. Exclusions win over inclusions.',
  'config.highlight':
    'Color highlight style. "square-before" / "square-after" draw a filled swatch, "dot-before" / "dot-after" a bullet. "off" disables highlighting.',
  'config.info': 'Show color information on hover.',
  'config.convertSyntax': 'Output style for rgb() and hsl().',
  'config.precision': 'Number of significant digits in generated color values.',
  'config.experimental': 'Draft specifications to enable. Both are on by default.',
  'config.advanced':
    'Incremental overrides for built-in options. Keys are dotted paths, for example {"output.hexCase": "upper"}. Top-level settings must not appear here.',

  // 内置层
  'advanced.highlight.markRuler': 'Show a marker in the overview ruler.',
  'advanced.highlight.matchWords':
    'Where to recognise color names: nowhere, CSS-like languages only, or every language.',
  'advanced.highlight.hexAlphaOrder': 'Interpretation of eight digit hex: #RRGGBBAA or #AARRGGBB.',
  'advanced.highlight.matchRgbWithoutFunction': 'Recognise bare "255, 136, 0" as an RGB color.',
  'advanced.highlight.rgbWithoutFunctionLanguages': 'Languages for the bare RGB mode.',
  'advanced.highlight.matchHslWithoutFunction': 'Recognise bare "30, 100%, 50%" as an HSL color.',
  'advanced.highlight.hslWithoutFunctionLanguages': 'Languages for the bare HSL mode.',
  'advanced.highlight.maxMatchesPerDocument': 'Stop highlighting after this many colors in one document.',
  'advanced.highlight.hdrToneMapping': 'Tone mapping used to preview HDR colors in sRGB.',
  'advanced.colorPicker.mode':
    'Native inline swatch and hover color picker (the picker is anchored on the swatch, so both come together). "dedupe" probes the other color providers in css/less/scss and only fills the gaps, so no color ever gets two swatches; "all" reports every supported syntax everywhere.',
  'advanced.fields.enabled':
    'Ordered list of color fields. Drives both the hover rows and which color syntax is highlighted. null uses the default order.',
  'advanced.fields.excluded':
    'Color fields to turn off. Exclusions win over the field list. Turning off a syntax also stops highlighting it.',
  'advanced.info.previewSize': 'Size of the hover color swatch.',
  'advanced.info.previewShape': 'Shape of the hover color swatch.',
  'advanced.info.showDiagnostics': 'Show parser notes in the hover.',
  'advanced.info.showSpecLevel': 'Show which specification level a syntax comes from.',
  'advanced.convert.enabled': 'Enable the conversion commands.',
  'advanced.convert.alphaLoss': 'What to do when the target format cannot express alpha.',
  'advanced.convert.missingComponentLoss': 'What to do when "none" components cannot be preserved.',
  'advanced.convert.namedColorFallback': 'What to do when no color name matches exactly.',
  'advanced.convert.recentFirst': 'Put recently used target formats at the top of the picker.',
  'advanced.output.gamutMapping': 'Gamut mapping strategy for sRGB output.',
  'advanced.output.hexCase': 'Letter case of generated hex values.',
  'advanced.scan.comments': 'Scan comments for colors.',
  'advanced.scan.strings': 'Scan string literals for colors.',
  'advanced.scan.maxDocumentSizeKb': 'Skip documents larger than this size.',
  'advanced.contextualPreview':
    'Color scheme assumed when previewing context dependent colors such as light-dark(). "auto" follows the editor theme. Results are marked as assumed.',
  'advanced.variables.resolve': 'Resolve CSS custom properties and preprocessor variables.',
  'advanced.variables.includePaths': 'Extra workspace relative search paths for imports.',
  'advanced.variables.maxImportDepth': 'Maximum import depth.',
  'advanced.variables.maxImportFiles': 'Maximum number of imported files.',
  'advanced.variables.maxResolveDepth': 'Maximum variable resolution depth.',
  'advanced.experimental.hdrAssumedHeadroom':
    'Assumed display HDR headroom used to preview hdr-color(). 0 disables the preview.',
  'advanced.coexistence.notify': 'Warn when the original three color extensions are also installed.',
  'advanced.logLevel': 'Verbosity of the output channel.',

  // 命令
  'command.category': 'W3C Color Toolkit',
  'command.convert': 'Convert Color',
  'command.copyColorAs': 'Copy Color As',
  'command.toggleFeatures': 'Enable Features',
  'command.configureColorFields': 'Configure Color Fields',
  'command.manage': 'Manage',
  'command.migrateLegacySettings': 'Migrate Legacy Plug-in Settings',
  'command.showEffectiveConfiguration': 'Show Effective Configuration',
  'command.showSupportMatrix': 'Show Specification Support Matrix',
  'command.rescanDocument': 'Rescan Current Document',
  'command.clearIndexCache': 'Clear Index Cache',
  'command.showOutputChannel': 'Open Log',
  'command.reportUnsupportedSyntax': 'Log Unsupported Syntax',
};

export const ZH_CN = {
  'extension.displayName': 'W3C Color Toolkit',
  'extension.description': '颜色高亮、悬停信息与格式转换, 支持 CSS Color 4/5/6 与 HDR。',
  'capabilities.untrustedWorkspaces': '未受信任的工作区只解析当前文档中的变量, 不读取导入的文件。',

  'config.enabled': '启用 W3C Color Toolkit。',
  'config.languages': '要处理的语言。可填 language id、`*` 表示全部, 或 `!id` 表示排除。排除项优先于包含项。',
  'config.highlight':
    '颜色高亮样式。`square-before` / `square-after` 画实心色块, `dot-before` / `dot-after` 画圆点; `off` 表示关闭高亮。',
  'config.info': '悬停时显示颜色信息。',
  'config.convertSyntax': '`rgb()` 与 `hsl()` 的输出风格。',
  'config.precision': '生成颜色值时保留的有效数字位数。',
  'config.experimental': '要启用的草案规范。两项默认都开启。',
  'config.advanced':
    '内置选项的增量覆盖。键为点分路径, 例如 `{"output.hexCase": "upper"}`。顶层设置不允许出现在这里。',

  'advanced.highlight.markRuler': '在概览标尺中显示标记。',
  'advanced.highlight.matchWords': '在哪些语言中识别颜色名: 不识别、仅 CSS 系语言、全部语言。',
  'advanced.highlight.hexAlphaOrder': '八位 Hex 的解释方式: `#RRGGBBAA` 或 `#AARRGGBB`。',
  'advanced.highlight.matchRgbWithoutFunction': '把裸写的 `255, 136, 0` 识别为 RGB 颜色。',
  'advanced.highlight.rgbWithoutFunctionLanguages': '启用无函数 RGB 模式的语言。',
  'advanced.highlight.matchHslWithoutFunction': '把裸写的 `30, 100%, 50%` 识别为 HSL 颜色。',
  'advanced.highlight.hslWithoutFunctionLanguages': '启用无函数 HSL 模式的语言。',
  'advanced.highlight.maxMatchesPerDocument': '单个文档中超过该数量后停止高亮。',
  'advanced.highlight.hdrToneMapping': '在 sRGB 中预览 HDR 颜色时使用的色调映射。',
  'advanced.colorPicker.mode':
    '原生行内色块与悬停取色器 (取色器挂在色块上, 两者同时出现)。`dedupe` 在 css/less/scss 里先探测其他颜色提供器, 只补它们没覆盖的位置, 因此不会有颜色出现两个色块; `all` 在所有语言上报全部受支持的语法。',
  'advanced.fields.enabled':
    '颜色字段的有序列表。同时决定悬停显示哪些行与高亮识别哪些颜色语法。`null` 表示使用默认顺序。',
  'advanced.fields.excluded':
    '要关闭的颜色字段。排除项优先于字段列表; 关闭某个语法同时会停止高亮它。',
  'advanced.info.previewSize': '悬停色块的尺寸。',
  'advanced.info.previewShape': '悬停色块的形状。',
  'advanced.info.showDiagnostics': '在悬停中显示解析说明。',
  'advanced.info.showSpecLevel': '显示该语法所属的规范层级。',
  'advanced.convert.enabled': '启用转换命令。',
  'advanced.convert.alphaLoss': '目标格式无法表达 alpha 时的处理方式。',
  'advanced.convert.missingComponentLoss': '`none` 分量无法保留时的处理方式。',
  'advanced.convert.namedColorFallback': '没有精确匹配的颜色名时的处理方式。',
  'advanced.convert.recentFirst': '把最近使用的目标格式置顶。',
  'advanced.output.gamutMapping': 'sRGB 输出的色域映射策略。',
  'advanced.output.hexCase': '生成 Hex 值的大小写。',
  'advanced.scan.comments': '扫描注释中的颜色。',
  'advanced.scan.strings': '扫描字符串字面量中的颜色。',
  'advanced.scan.maxDocumentSizeKb': '超过该大小的文档不扫描。',
  'advanced.contextualPreview':
    '预览 `light-dark()` 等上下文相关颜色时假设的配色方案。`auto` 跟随编辑器主题。结果会标注为假设值。',
  'advanced.variables.resolve': '解析 CSS 自定义属性与预处理器变量。',
  'advanced.variables.includePaths': '导入解析时额外的工作区相对搜索路径。',
  'advanced.variables.maxImportDepth': '导入深度上限。',
  'advanced.variables.maxImportFiles': '导入文件数上限。',
  'advanced.variables.maxResolveDepth': '变量解析深度上限。',
  'advanced.experimental.hdrAssumedHeadroom': '预览 `hdr-color()` 时假设的显示器 HDR headroom。0 表示不预览。',
  'advanced.coexistence.notify': '同时安装了原三个颜色扩展时给出提示。',
  'advanced.logLevel': 'Output Channel 的日志级别。',

  'command.category': 'W3C Color Toolkit',
  'command.convert': '转换颜色',
  'command.copyColorAs': '复制颜色为',
  'command.toggleFeatures': '启用功能',
  'command.configureColorFields': '配置颜色字段',
  'command.manage': '管理',
  'command.migrateLegacySettings': '迁移旧插件设置',
  'command.showEffectiveConfiguration': '显示生效配置',
  'command.showSupportMatrix': '显示规范支持矩阵',
  'command.rescanDocument': '重新扫描当前文档',
  'command.clearIndexCache': '清空索引缓存',
  'command.showOutputChannel': '打开日志',
  'command.reportUnsupportedSyntax': '记录不支持的语法',
};

/** 24 个直达转换命令的标题由格式标签生成, 两种语言共用同一个动词模板。 */
export const CONVERT_TITLE_TEMPLATE = {
  en: (label) => `Convert Color to ${label}`,
  'zh-cn': (label) => `转换颜色为 ${label}`,
};
