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
  'config.highlight':
    'Color highlight style. "square-before" / "square-after" draw a filled swatch, "dot-before" / "dot-after" a bullet. "off" disables highlighting.',
  'config.info': 'Show color information on hover.',
  'config.convertSyntax': 'Output style for rgb() and hsl().',
  'config.precision': 'Number of significant digits in generated color values.',
  'config.experimental': 'Draft specifications to enable. Both are on by default.',
  'config.advanced':
    'Incremental overrides for built-in options. Keys are dotted paths, for example {"output.hexCase": "upper"}. Top-level settings must not appear here.',

  // 内置层
  'advanced.disable.maxFileSizeMb':
    'Hide the extension in documents longer than this, measured in MB of UTF-16 code units (1 MB = 1048576). 0 means no limit.',
  'advanced.disable.fileNames':
    'Hide the extension in files whose name matches one of these gitignore-style patterns. Matched against the file name only, so patterns must not contain "/". Later entries win and "!" re-enables.',
  'advanced.disable.languageIds':
    'Hide the extension in these language ids, written as gitignore-style patterns. Later entries win and "!" re-enables.',
  'advanced.highlight.markRuler': 'Show a marker in the overview ruler.',
  'advanced.highlight.matchWords':
    'Where to recognise color names: nowhere, CSS-like languages only, or every language.',
  'advanced.highlight.hexAlphaOrder': 'Interpretation of eight digit hex: #RRGGBBAA or #AARRGGBB.',
  'advanced.highlight.maxMatchesPerDocument': 'Stop highlighting after this many colors in one document.',
  'advanced.highlight.hdrToneMapping': 'Tone mapping used to preview HDR colors in sRGB.',
  'advanced.colorPicker.mode':
    'Native inline swatch and hover color picker (the picker is anchored on the swatch, so both come together). "dedupe" probes the other color providers wherever a built-in one also contributes colors (CSS, HTML and JSON language services) and only fills the gaps, so no color ever gets two swatches; "all" reports every supported syntax everywhere.',
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
  'advanced.contextualPreview':
    'Color scheme assumed when previewing context dependent colors such as light-dark(). "auto" follows the editor theme. Results are marked as assumed.',
  'advanced.variables.resolve': 'Resolve CSS custom properties and preprocessor variables.',
  'advanced.variables.lookupGlobs':
    'Where to look for variable definitions, as workspace relative glob patterns. node_modules, dist, out, build and similar directories are always excluded. Definitions are found by this list, not by following @import, because stylesheets are often combined by a JS bundler instead.',
  'advanced.variables.maxIndexedFiles': 'Maximum number of stylesheets to index for variable definitions.',
  'advanced.variables.languageIds':
    'Language ids in which variable references are recognised. null uses the built-in list (css, scss, sass, less, postcss, tailwindcss). This is separate from highlight.matchWords, which only decides where bare color names count.',
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
  'config.highlight':
    '颜色高亮样式。`square-before` / `square-after` 画实心色块, `dot-before` / `dot-after` 画圆点; `off` 表示关闭高亮。',
  'config.info': '悬停时显示颜色信息。',
  'config.convertSyntax': '`rgb()` 与 `hsl()` 的输出风格。',
  'config.precision': '生成颜色值时保留的有效数字位数。',
  'config.experimental': '要启用的草案规范。两项默认都开启。',
  'config.advanced':
    '内置选项的增量覆盖。键为点分路径, 例如 `{"output.hexCase": "upper"}`。顶层设置不允许出现在这里。',

  'advanced.disable.maxFileSizeMb':
    '超过该长度的文档隐藏本扩展。单位 MB, 按 UTF-16 码元计 (1 MB = 1048576)。0 表示不限制。',
  'advanced.disable.fileNames':
    '文件名匹配这些 gitignore 语法模式时隐藏本扩展。只匹配文件名, 因此模式不能包含 "/"。后面的条目覆盖前面的, "!" 表示重新启用。',
  'advanced.disable.languageIds':
    '语言标识匹配这些 gitignore 语法模式时隐藏本扩展。后面的条目覆盖前面的, "!" 表示重新启用。',
  'advanced.highlight.markRuler': '在概览标尺中显示标记。',
  'advanced.highlight.matchWords': '在哪些语言中识别颜色名: 不识别、仅 CSS 系语言、全部语言。',
  'advanced.highlight.hexAlphaOrder': '八位 Hex 的解释方式: `#RRGGBBAA` 或 `#AARRGGBB`。',
  'advanced.highlight.maxMatchesPerDocument': '单个文档中超过该数量后停止高亮。',
  'advanced.highlight.hdrToneMapping': '在 sRGB 中预览 HDR 颜色时使用的色调映射。',
  'advanced.colorPicker.mode':
    '原生行内色块与悬停取色器 (取色器挂在色块上, 两者同时出现)。`dedupe` 在内置提供器也会给颜色的语言 (CSS 系、HTML 系、JSON 系语言服务) 里先探测其他颜色提供器, 只补它们没覆盖的位置, 因此不会有颜色出现两个色块; `all` 在所有语言上报全部受支持的语法。',
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
  'advanced.contextualPreview':
    '预览 `light-dark()` 等上下文相关颜色时假设的配色方案。`auto` 跟随编辑器主题。结果会标注为假设值。',
  'advanced.variables.resolve': '解析 CSS 自定义属性与预处理器变量。',
  'advanced.variables.lookupGlobs':
    '到哪里查找变量定义, 写成工作区相对的 glob 模式。node_modules、dist、out、build 等目录始终排除。定义靠这份列表发现而不是跟随 `@import` —— 样式文件常常由 JS 打包器合并, 没有任何 CSS 层面的导入。',
  'advanced.variables.maxIndexedFiles': '为变量定义建立索引的样式文件数上限。',
  'advanced.variables.languageIds':
    '在哪些语言标识中识别变量引用。null 表示使用内置列表 (css、scss、sass、less、postcss、tailwindcss)。它与 `highlight.matchWords` 分开 —— 后者只决定裸颜色名在哪里算颜色。',
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
