# 故障排查

[English](../../docs/troubleshooting.md) · **简体中文**

这页帮你解决颜色缺失、重复、转换被拒或结果过时的问题；前提是插件已安装并启用。多数问题要用到「W3C Color Toolkit: 管理」命令里的某个操作，下面各节会写明是哪一个。

## 没有出现行内色块

- 原因：VS Code 的 `editor.colorDecorators` 已关闭。解决：打开它。
- 原因：`advanced.colorPicker.mode` 为 `off`。解决：改为 `dedupe`。
- 原因：文件里的颜色超过 `editor.colorDecoratorsLimit`（默认 500），日志中会出现 `document has more than editor.colorDecoratorsLimit colors`。解决：调大这个 VS Code 设置。
- 原因：文件因大小或模式规则被排除。解决：见[颜色没有被高亮](#颜色没有被高亮)。

## 一个颜色出现两个色块

- 原因：`advanced.colorPicker.mode` 为 `all`。解决：改为 `dedupe`。
- 原因：Tailwind CSS IntelliSense、Volar 这类第三方颜色插件报告了同一范围。解决：把对应语言加进 `advanced.colorPicker.dedupeLanguages`，做法见[用取色器改色](./color-picker.md#让每个颜色只有一个色块)。

## 颜色没有被高亮

按可能性从高到低排查：

1. `w3cColorToolkit.highlight` 为 `off`。
2. 文件被 `advanced.disable.fileNames` 或 `advanced.disable.languageIds` 排除；默认会排除 `*.min.*`、`*.map`、日志文件和纯文本。
3. 该语法的字段在「配置颜色字段」里被关掉了。
4. 这个值依赖上下文，例如 `currentColor` 或有多处定义的变量，见[支持的颜色语法](./color-support.md#依赖上下文的值)。
5. 文档长度超过 `advanced.disable.maxFileSizeMb`（默认约 307 KiB）。
6. 文档里的颜色多于 `advanced.highlight.maxMatchesPerDocument`（默认 600）。
7. 这是非类 CSS 语言里的 `red` 这类裸颜色名，而 `advanced.highlight.matchWords` 仍是 `css-like`。

文件被排除的原因会写进日志；调大对应的上限，或收窄对应的列表即可。

## 取色器不让我修改某个值

- 原因：这是只读色块，因为该值依赖上下文、是已解析的变量，或属于 `color-mix()` 这类只读语法。解决：用「转换颜色」有意改写它。

## 转换被拒绝

提示里会写明原因：

- `无法转换上下文相关的颜色: …` → 这个值依赖上下文或变量。解决：转换它解析出的字面量，或去改变量定义。
- `… 无法表达 alpha。可修改 convert.alphaLoss 允许丢弃。` → 目标格式没有 alpha 通道。解决：把 `advanced.convert.alphaLoss` 设为 `confirm` 或 `drop`，或换一个带 alpha 的目标格式。
- `没有与该颜色精确匹配的颜色名。` → 解决：把 `advanced.convert.namedColorFallback` 设为 `nearest`。
- `选区不是一个完整有效的颜色表达式。` → 选区只覆盖了颜色的一部分，或覆盖了不止一个颜色。解决：取消选区只留光标，或恰好选中一个颜色。

## 变量引用什么都不显示

找不到可用定义的引用本来就什么都不显示。先用「管理」→「打开日志」看原因，再依次检查：

1. `advanced.variables.resolve` 为 `true`，且文件的语言在 `advanced.variables.languageIds` 中。
2. 定义文件匹配 `advanced.variables.lookupGlobs`，且不在 `node_modules`、`dist` 这类始终跳过的目录下（完整列表见[解析变量](./variables.md#让插件找到变量定义文件)）。
3. 工作区已受信任，或定义文件已在编辑器中打开。
4. 索引文件数没有超过 `advanced.variables.maxIndexedFiles`，引用链也没有超过 `advanced.variables.maxResolveDepth`。
5. 取值不需要求值：SCSS map、`@each`、mixin、算术运算、`darken()` 和 Stylus 变量都不支持。

只在 `[data-theme="…"]` 或 `.dark` 下定义的变量属于另一种情况：悬停会列出候选值，色块是有意隐藏的。见[解析变量](./variables.md#一次查找的三种结果)。

## `advanced` 里的某个键不生效

- 原因：键名未知、类型错误、超出范围，或者它是 7 个顶层设置之一。解决：执行「管理」→「显示生效配置」，它会列出每个键及其来源，以及被拒绝的键。需要更多细节时，把 `advanced.logLevel` 设为 `debug` 再打开日志。

## 结果像是过时了

- 解决：执行「管理」→「重新扫描当前文档」或「清空索引缓存」。
- 遇到插件不认识的语法时，「管理」→「记录不支持的语法」会把它记下来，方便到 [issue 列表](https://github.com/HeavenSky/w3c-color-toolkit/issues)提交问题。

## 已知限制

- 超大文档的扫描会明显变慢；`advanced.disable.maxFileSizeMb` 和 `advanced.highlight.maxMatchesPerDocument` 用来限制工作量。
- CSS Color 6 和 CSS Color HDR 仍是草案，取值和语法都可能变化。
- 未受信任的工作区只使用已打开文件中的定义。
- 变量解析不对表达式求值，Stylus 变量也不解析。
- 从不下载远程 ICC 配置文件；`device-cmyk()` 使用朴素回退并标注为近似值。
