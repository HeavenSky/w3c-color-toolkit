# 更新日志

[English](../CHANGELOG.md) · **简体中文**

W3C Color Toolkit 的重要变化。

## v0.0.9 2026-10-16 预处理器变量按作用域取值

### 变更

- 文档：README 精简为概览，完整用法移到[文档页](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/README.md)，中文页放在 `zh/` 下。

### 修复

- **Less 变量的取值与 Less 编译结果一致。** 作用域内最后一个定义生效，即使它写在引用之后；在定义之前使用的变量现在会显示颜色，不再什么都不显示。
- **SCSS 与 Less 变量遵循块作用域。** 块内的定义在该块内覆盖外层定义，不会再被兄弟块或其他文件里的块取用；`!global` 赋值仍算顶层定义。见[一次查找的三种结果](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/variables.md#一次查找的三种结果)。
- **规范支持矩阵跟随显示语言。** 「显示规范支持矩阵」以前始终是中文；现在默认显示英文，VS Code 使用中文界面时显示中文。

## v0.0.8 2026-10-12 取色器保留原文

### 变更

- 文档：README 为每项功能配了截图。图片在浏览页面时从 GitHub 加载，不打包进插件。

### 修复

- **打开原生取色器不再改写颜色。** VS Code 以 8 位 sRGB 传递取色器颜色，所以 `color(display-p3 0.2 0.8 0.4)` 这类广色域值会显示成 `color(display-p3 0.363 0.791 0.427)`，连 `oklch(60% 0.1 200)` 这类色域内的值也会被重新序列化；在取色器顶部点一下，有损的值就写回了文件。现在只要颜色没变，取色器给出的第一种写法就是原文，其他格式从原始值换算。拖到新颜色时的行为不变。
- **取值不唯一的变量，悬停不再显示 `Specification: CSS Color 4`。** 有多个候选定义的 `var(--x)`、`$x`、`@x` 引用没有 CSS Color 层级；颜色函数里的变量在所有候选层级一致时取该层级。

### 内部

- 同步了共享骨架脚本；`npm run shots` 用于手动重新生成截图，不参与打包和发布。

## v0.0.7 2026-10-08 新图标，文档对齐

### 变更

- **新图标**：色相条上方一块取色面板，沿用其他 HeavenSky 插件的扁平画风和强调色，取代原来的 OKLCH 渐变环。
- VS Code 显示的未受信任工作区说明与实际行为一致了：只使用已打开文件里的定义，不读取磁盘上的其他文件。

### 修复

- **README 与 README.zh-cn 彼此一致，也与代码一致**：内置选项是 34 个（不是 33 个），「管理」里有六个操作（不是七个），命令名与界面一致，`coexistence.notify` 写明了它实际检测的三个插件，变量相关的故障排查条目不再描述改用 glob 之前的查找方式。

### 内部

- `package-lock.json` 里的每个 tarball 都从 `registry.npmjs.org` 解析。npm 12 默认 `allow-remote=none`，镜像地址会被当成远程 tarball，`npm ci` 因此拒绝安装。

## v0.0.6 2026-08-13 CSS 以外的重复色块

### 新增

- `advanced.colorPicker.dedupeLanguages`（`string[]`，默认 `[]`）让 `dedupe` 模式也探测第三方颜色插件所在的语言；见[让每个颜色只有一个色块](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/color-picker.md#让每个颜色只有一个色块)。

    内置选项从 33 个增加到 34 个。

### 修复

- **HTML `<style>` 块里的每个颜色都有两个色块。** 探测其他颜色提供器时只看 `css` / `less` / `scss`，这份列表取自 `vscode.css-language-features` 的激活事件。但 `vscode.html-language-features` 会对内嵌 CSS（`<style>` 块与 `style` 属性）运行同一个 CSS 语言服务，它的服务端同样声明了 `colorProvider`，于是在 HTML 里它和本插件报告了同一个范围，VS Code 把两个都画了出来。现在凡是内置语言服务会提供颜色的语言都在探测范围内。
- **JSON 里也有同样的重复。** `vscode.json-language-features` 会为 schema 标明 `format: color-hex` 的字符串报告颜色，例如主题文件和 `settings.json` 里的 `workbench.colorCustomizations`。修复要做两件事：一是探测 `json` / `jsonc`，二是让范围对得上。JSON 服务报告的是**连引号在内**的整个字符串节点，本插件报告的是引号内的颜色，按范围精确比较永远对不上；现在带引号的探测结果也视为覆盖引号内的范围。
- **探测的语言集合不再写死。** HTML 和 JSON 语言服务都会接管任何插件通过 `contributes.htmlLanguageParticipants` / `jsonLanguageParticipants` 注册的语言，内置的 handlebars 插件就是这样把 `handlebars` 交给 HTML 服务的。现在这个集合根据已安装的插件计算，插件变化时重新计算，因此 `handlebars` 和第三方参与者也覆盖到了。

第三方颜色插件（Tailwind CSS IntelliSense、Volar 等）仍不在处理范围内：它们在哪些语言里注册提供器，无法从它们的清单推导出来，所以和这类插件重叠时，仍然只能关掉其中一个。

## v0.0.5 2026-08-12 变量、嵌套色块与无效配置

### 移除

- **破坏性变更。** 移除 `advanced.variables.includePaths`、`advanced.variables.maxImportDepth` 与 `advanced.variables.maxImportFiles`，改由 `advanced.variables.lookupGlobs`、`advanced.variables.maxIndexedFiles` 和 `advanced.variables.languageIds` 取代。三个旧键只用于配置 `@import` 遍历，而这一遍历从未运行过（见「修复」），所以移除它们不会少任何功能。现在设置它们会产生 `unknown-key` 警告。迁移：把变量定义文件列进 `advanced.variables.lookupGlobs`，再删掉三个旧键。
- **破坏性变更。** 不再解析 Stylus 变量。`.styl` 文件里的颜色不受影响，hex、颜色名和颜色函数照样识别，但 `$brand = #ff8800` 这样的定义和 `color: $brand` 这样的引用不再解析。PostCSS 没有官方的 Stylus 语法包，唯一的第三方桥接依赖 Stylus 编译器和 `glob`，两者都用到 Node 内置模块，会破坏浏览器端的打包产物。原来的正则实现还会把 `$brand = …` 的定义一侧误报成引用，因为 Stylus 用 `=` 而不是 `:` 赋值。迁移：把需要显示解析结果色块的变量移到 CSS、SCSS 或 Less 文件里。
- **破坏性变更。** 移除四个从未起作用的内置选项：`advanced.highlight.matchRgbWithoutFunction`、`advanced.highlight.rgbWithoutFunctionLanguages`、`advanced.highlight.matchHslWithoutFunction` 与 `advanced.highlight.hslWithoutFunctionLanguages`。它们描述的是「裸写 `255, 136, 0` 也算颜色」的模式，这个模式从未实现：扫描器没有这个分支，`ScanOptions` 也没有对应字段，改它们毫无效果。现在设置它们会在日志里产生 `unknown-key` 警告，而不是悄无声息地什么都不做。迁移：从 `w3cColorToolkit.advanced` 里删掉这四个键。
- **破坏性变更。** 移除旧设置迁移：`w3cColorToolkit.migrateLegacySettings` 命令、它在「管理」里的入口，以及 `color-highlight.*` / `colorInfo.*` 键的整张映射表。原来三个插件仍安装时弹出的共存提示不受影响。迁移：手动设置对应的 `w3cColorToolkit.*` 键，再删掉旧的 `color-highlight.*` / `colorInfo.*` 键。

内置选项从 37 个减到 33 个，隐藏命令从 31 个减到 30 个。

### 新增

- **变量解析真正可用了。** `var(--brand)`、`$brand` 和 `@brand` 会解析成实际颜色，参与高亮、悬停和行内色块。这部分适配层早就写好，却一直没接到扫描流程上：`FileReader` 创建后立即被丢弃，五个适配模块没有任何地方引用。定义来自工作区符号索引（见下文），扫描时的查找是同步的。`@color-profile --name { fallback: … }` 也会收集，因此 `color(--name …)` 能够解析。
- **引用里的颜色有自己的色块和取色器**：`var(--brand, #ff8800)` 会显示两个；见[嵌套引用与已解析引用](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/variables.md#嵌套引用与已解析引用)。
- 悬停、「转换颜色」和取色器都作用于光标处**最内层**的颜色，处理嵌套值时改的就是这个值，而不是外面的整个表达式。
- **按 glob 查找变量定义，不再跟随 `@import`**，由 JS 打包器合并的变量定义文件也能找到；见[让插件找到变量定义文件](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/variables.md#让插件找到变量定义文件)。
- **「不唯一」成为单独的一种结果**：按主题或按媒体查询分别定义的变量，悬停时列出全部候选值，不会直接消失；见[一次查找的三种结果](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/variables.md#一次查找的三种结果)。
- **定义从真正的 CSS AST 中收集。** `postcss`、`postcss-scss` 和 `postcss-less` 取代了 13 个手写的正则表达式。注释、嵌套规则、条件 at 规则和方言差异都按语法结构处理，不再逐个模式匹配；有语法错误的文件只会失去它自己的定义。
- **作为颜色函数一部分的变量现在能解析**，例如 Tailwind 风格的 `rgb(var(--channels) / 0.4)`；见[在颜色函数里使用变量](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/variables.md#在颜色函数里使用变量)。

### 变更

- **两个默认值调低了。** `advanced.disable.maxFileSizeMb` `1` → `0.3`（314,573 个 UTF-16 码元，约 307 KiB），`advanced.highlight.maxMatchesPerDocument` `1000` → `600`。大小介于新旧阈值之间的文档默认不再高亮；允许的取值范围不变，调高任一键即可恢复原来的行为。已经显式设置过这两个键的用户不受影响。

- **没有定义的引用什么都不显示**：不高亮，没有色块，也没有悬停。定义缺失、取值不是颜色、循环引用、超过 `maxResolveDepth`，以及未受信任工作区里无法读取的文件，都属于这种情况。取值只是不唯一的引用是另一回事，仍保留悬停，见上文。SCSS map、`@each`、mixin 以及 `darken($x, 10%)` 这类调用不会求值，因此也归入什么都不显示的情况。
- **已解析的变量引用是只读的**：取色器只显示颜色，不允许拖动；「转换颜色」会拒绝执行，并指出是哪个变量。把 `var(--brand)` 改写成字面量会毁掉这个设计变量。
- 刚激活时，来自其他文件的颜色可能稍晚才出现，因为建立索引要异步读取文件，但这不会阻塞激活。之后由文件监视器保持索引最新，编辑已打开的样式表时会立即按编辑器里的内容更新。

### 修复

- **跨文件变量解析从未真正运行过。** 索引只在同步阶段留下未解析的变量时才安排异步的跨文件阶段，可同步阶段本身就会移除这些匹配，所以条件永远为假，`schedulePatch()` 根本执行不到。现在变量从工作区符号索引解析，扫描时只是一次普通的同步查找，也就不存在执行不到的第二阶段。
- **被注释掉的定义会连累真正的定义。** `:root { /* --a: red; */ --a: #ff8800 }` 以前会报告两个定义，结果两个都放弃。现在定义从 PostCSS AST 收集，注释就是注释。
- **值里的注释让值无法解析。** `--a: /* c */ #ff8800` 的原始值带着注释，颜色解析失败，引用随之悄悄消失。
- **前面有注释的 `:root` 块不被识别为 `:root`。** 声明所属的选择器靠向前扫描到上一个 `{` / `}` / `;` 得到，夹在中间的注释也被一并扫进来，于是再普通不过的 `@layer base { /* … */ :root { --border: … } }` 会被当成非根定义而遭拒绝。现在会先去掉选择器文本里的注释。凡是 `:root` 块前恰好有注释的自定义属性都受影响，而真实的样式表大多如此。

## v0.0.4 2026-08-11 禁用模式

### 移除

- **破坏性变更。** 移除 `w3cColorToolkit.languages`。它是允许列表，替代它的 `advanced.disable.languageIds` 是拒绝列表，两者没法只靠改名对应，所以不再读取旧值。请手动转换；按 gitignore「后面的条目覆盖前面的」规则可以精确对应：`["*"]` → `[]`，`["*", "!plaintext"]` → `["plaintext"]`，`["css", "scss"]` → `["*", "!css", "!scss"]`，`[]` → `["*"]`。从 `color-highlight.languages` 或 `colorInfo.languages` 迁移来的设置，会由「管理」→「迁移旧插件设置」自动转换。
- **破坏性变更。** `advanced.scan.maxDocumentSizeKb` 由 `advanced.disable.maxFileSizeMb` 取代。旧键只跳过建立索引，悬停仍会退回到扫描当前行，超大文档其实并没有被放过。新键直接隐藏插件。单位从字节计的 KB 改为 UTF-16 码元计的 MB，因此对非 ASCII 文本，实际限制比磁盘上的大小宽松。迁移：把 `advanced.disable.maxFileSizeMb` 设为旧值除以 1024，并删除旧键。

### 新增

- 新增禁用模式：文件超过 `advanced.disable.maxFileSizeMb`（默认 `1`），或匹配 `advanced.disable.fileNames` / `advanced.disable.languageIds` 时，插件完全隐藏，也不扫描；见[让插件不处理某些文件](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/configuration.md#让插件不处理某些文件)。

### 变更

- **默认值。** 几项默认值改为优先保证开箱即用时更安静、更快，而不是「什么都高亮」：
  `w3cColorToolkit.precision` `5` → `3`；
  `advanced.disable.maxFileSizeMb` 实际从 `2` → `1`（旧键的 `2048` KB）；
  `advanced.highlight.maxMatchesPerDocument` `10000` → `1000`；
  `advanced.disable.fileNames` `[]` → `["*.min.*", "*.map"]`；
  `advanced.disable.languageIds` `[]` → `["log", "plaintext"]`。
  影响：压缩后的打包文件、source map、日志文件和纯文本默认不再处理，除非你重新开启；颜色超过 1000 个的文档会在中途停止高亮。把两个模式列表设为 `[]`，即可恢复以前「从不隐藏」的行为。

### 修复

- 大小检查不再使用 Web 扩展宿主里不存在的 `Buffer`，也不再为了测量大小而把整个文档物化出来。
- 输入时文档变大、超过大小限制而被隐藏后，装饰会被清除。以前这条路径上没有任何东西触发重新渲染，过期的标记会一直留在屏幕上。
- 转换命令现在也遵守语言与文件过滤。以前只有高亮、悬停和色块遵守。

## v0.0.3 2026-08-07

### 变更

- 新图标：色轮中央并排放着三个色块。原图标是围着一个空洞的色轮，能看出「色彩空间」，却看不出插件做什么。三个并排的色块表示「同一个颜色的多种写法」，正对应本插件的行内色块和跨色彩空间转换。色块颜色复用色轮自身的 `ringColor`，取三个等距色相（25 / 145 / 265），因此不会和色环冲突。内半径从 `0.205` 增大到 `0.219`，为色块腾出空间。

### 内部

- 构建脚手架与共享骨架同步：VSIX 白名单现在从 `contributes.languages` / `grammars` / `snippets` 推导条目，并允许打包产物旁边放一个 `*.wasm`；l10n 目录可以按来源分子目录。本插件没有用到这些新增能力，这次改动纯属对齐，不影响行为。

## v0.0.2 2026-08-05

### 新增

- 本插件支持的每种语法都有行内色块和原生取色器，包括 `oklch()`、`color()` 以及注释和字符串里的颜色，由 `advanced.colorPicker.mode` 控制（默认 `dedupe`，在 `css` / `less` / `scss` 里只补其他提供器漏掉的范围）；见[用取色器改色](https://github.com/HeavenSky/w3c-color-toolkit/blob/HEAD/zh/docs/color-picker.md)。
- `contributes.configurationDefaults` 把 `editor.defaultColorDecorators` 设为 `never`：内置提供器识别的 hex 和 `rgb()`/`hsl()` 写法是本插件所报告内容的真子集，关掉它只去掉重叠部分，覆盖范围不受影响。用户仍可改回 `auto` / `always`。
- 新增两种标记样式 `square-before` / `square-after`，由本插件自己的装饰画成实心方块，不经过 VS Code 的颜色功能（原有的 `dot-before` / `dot-after` 仍是圆点）。

### 变更

- 高亮和悬停现在共用一张字段表：`advanced.info.fields` / `advanced.info.excludedFields` 改名为 `advanced.fields.enabled` / `advanced.fields.excluded`，同时决定悬停显示哪些行、高亮哪些颜色语法，高亮不再需要单独配置。命令 `w3cColorToolkit.configureInfoFields` 改名为 `w3cColorToolkit.configureColorFields`。
- 字段表现在覆盖全部 41 种可扫描的语法，按作用范围分组：CSS 格式（悬停和高亮）、只读 CSS 语法（仅高亮，例如 `color-mix()`、相对颜色、`light-dark()`、系统颜色）、非 CSS 表示（仅悬停的 `hsv` / `cmyk`），以及本身不是颜色的补充信息（仅悬停的预览、原始语法、alpha、色域、对比度、规范层级、解析说明）。注册表里没有的语法一律放行，解析器新增的语法就不会悄悄失去高亮。
- 新增悬停字段 `color-srgb`、`color-srgb-linear` 和 `color-display-p3-linear`，悬停覆盖全部 24 个转换目标。
- `advanced.contextualPreview` 新增 `auto` 并设为默认：`light-dark()` 的分支跟随编辑器当前主题，`light-dark()` 开箱就有预览颜色和高亮。悬停里仍会把结果标为假设值，切换主题会触发重新扫描。设为 `off` 可恢复以前的行为。
- 在「配置颜色字段」里勾选之前被 `fields.excluded` 排除的字段时，现在会一并清除该排除项；关闭 HDR 开关时，不会再仅仅因为 HDR 字段不在勾选列表里，就把它们从配置中删掉。

## v0.0.1 2026-08-04

第一个本地开发构建，把三个参考插件互补的能力合并到一套共享的颜色内核上。

### 新增

- 统一的颜色内核：扫描、解析、求值、色域映射和序列化由高亮、悬停和转换共用，对同一个表达式，三者得出的范围、颜色值、alpha、原始色彩空间和解析状态都相同。
- 完整的 CSS Color 4 静态语法：148 个命名颜色、四种长度的 hex、旧式与现代语法、百分比、alpha、四种角度单位、`none`、静态 `calc()`，以及 10 个预定义的 `color()` 色彩空间。
- CSS Color 5 中可静态求值的部分：`color-mix()`（包括三个及以上颜色的形式和四种色相插值方法）、相对颜色语法、Relative Alpha Color `alpha()`、`contrast-color()`、不带 ICC 回退的 `device-cmyk()`，以及 `@color-profile` 的 `fallback` 描述符。
- 依赖上下文的颜色单独归类：`currentColor`、19 个系统颜色、23 个已弃用的系统颜色（附替代提示）、`light-dark()`、没有 fallback 的自定义 profile，以及非静态的 alpha，都解析为 `contextual`，不会当成黑色。
- 实验性的 CSS Color 6 支持（默认开启，可用 `w3cColorToolkit.experimental` 切换）：`color-layers()`、扩展的 `contrast-color()`、`wcag2` / `wcag2(aa | aaa | large)`、`tbd-fg` / `tbd-bg`。
- 实验性的 CSS Color HDR 1 支持（默认开启，同一个开关）：`ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq | rec2100-hlg | rec2100-linear)`，以及始终依赖上下文的 `hdr-color()`。
- 三项功能：带六种标记样式的颜色高亮、字段可配置的悬停信息，以及到 24 种目标格式的转换。
- 两层配置：8 个公开的键，外加 `w3cColorToolkit.advanced` 下的 34 个增量覆盖。`advanced` 对象自带三种就地参考：完整的中英文表格（键 / 类型 / 默认值 / 说明）、可插入的完整模板与最简模板，以及逐键补全和悬停文档。
- 入口：5 个命令面板命令、一个编辑器右键子菜单（转换与复制），以及 31 个可绑定快捷键的隐藏命令。不提供默认快捷键。
- 一个迁移旧设置和旧命令的命令，覆盖三个作用域，可以重复运行。
- 界面支持 English 和简体中文。命令标题跟随显示语言：英文界面是 `Convert Color`，中文界面是 `转换颜色`。

### 已知限制

- 扫描超大文档（几千个颜色以上）明显慢于目标预算，正在改进；在此之前可用 `advanced.scan.maxDocumentSizeKb` 和 `advanced.highlight.maxMatchesPerDocument` 限制开销。
- `hdr-color()` 取决于显示器的 HDR headroom，只能按假设值预览。
- CSS Color 6 和 CSS Color HDR 都还是草案，取值和语法可能变化。
- 未受信任的工作区里不跨文件解析变量。
- 没有依赖 VS Code 运行时的自动化集成测试。质量关卡是类型检查、贡献点与本地化一致性检查、单元测试，以及不依赖运行时的冒烟检查；需要真实 Extension Host 的行为靠手动验收。
