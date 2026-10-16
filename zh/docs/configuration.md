# 配置

[English](../../docs/configuration.md) · **简体中文**

不做任何配置也能正常使用。读完这页，你会知道设置如何分层、每个内置选项做什么，以及怎样让插件不处理某些文件；前提是你能编辑 `settings.json`。

## 使用 7 个顶层设置

设置界面里有 7 个设置，插件市场页的 Feature Contributions 标签也会列出它们：总开关 `enabled`、标记样式 `highlight`、悬停开关 `info`、转换输出用的 `convertSyntax` 与 `precision`、草案规范开关 `experimental`，以及下文介绍的 `advanced` 对象。它们的作用域都是 `resource`，每个工作区文件夹可以各设各的值。

`experimental` 列出要启用的草案 `cssColor6` 和 `cssColorHdr`，默认两者都开启。

「W3C Color Toolkit: 启用功能」在一个 Quick Pick 里开关高亮、色块与取色器、悬停、转换、变量解析和两份草案，一般不需要手动改这些设置。

## 覆盖内置选项

其余 34 个选项内置默认值，通过 `w3cColorToolkit.advanced` **逐个键覆盖**，键名是扁平的点分写法：

```jsonc
{
  "w3cColorToolkit.advanced": {
    "output.hexCase": "upper",
    "highlight.maxMatchesPerDocument": 3000,
    "variables.lookupGlobs": ["src/styles/**/*.css"]
  }
}
```

在 `settings.json` 的这个对象里输入 `"`，每个键都有补全、悬停说明和取值范围检查。另有两个代码片段，一个插入全部选项及默认值，一个插入最小示例。

- 没写的键保持默认值；数组和对象类型的值整体替换默认值。
- 7 个顶层设置写在这里会被忽略并给出警告，保证每项设置只有一个出处。
- 未知键和类型错误的值会被忽略，超出范围的数字会被截到边界，每种情况都记入日志而不是报错。
- 用户、工作区和文件夹三级的值按键逐个合并，而 VS Code 原生的做法是整体替换整个对象。
- 「W3C Color Toolkit: 管理」→「显示生效配置」会打印合并结果、每个键来自哪一级，以及被拒绝的键。

## 查找选项

| 键 | 取值（首项为默认） | 作用 |
| --- | --- | --- |
| `disable.maxFileSizeMb` | `0.3`，0 到 1024 | 文档超过此大小时不处理，见[下文](#让插件不处理某些文件) |
| `disable.fileNames` | `["*.min.*", "*.map"]` | 命中即不处理的文件名模式 |
| `disable.languageIds` | `["log", "plaintext"]` | 命中即不处理的语言 ID 模式 |
| `highlight.markRuler` | `true`、`false` | 概览标尺上的打点 |
| `highlight.matchWords` | `css-like`、`off`、`all` | 裸颜色名在哪里算颜色，见[高亮与悬停](./highlight-and-hover.md#选择哪些颜色参与) |
| `highlight.hexAlphaOrder` | `rgba`、`argb` | 8 位 hex 的解读方式 |
| `highlight.maxMatchesPerDocument` | `600`，1 到 1000000 | 每个文档最多高亮的颜色数 |
| `highlight.hdrToneMapping` | `reinhard`、`clip`、`none` | HDR 预览的色调映射 |
| `colorPicker.mode` | `dedupe`、`all`、`off` | 色块如何与其他提供程序共存，见[用取色器改色](./color-picker.md#让每个颜色只有一个色块) |
| `colorPicker.dedupeLanguages` | `[]` | `dedupe` 模式下额外探测的语言 |
| `fields.enabled` | `null` 或字段 ID 列表 | 悬停与高亮使用的字段，顺序即悬停顺序；`null` 表示默认列表 |
| `fields.excluded` | `[]` | 要关闭的字段，排除项优先 |
| `info.previewSize` | `small`、`large` | 悬停预览的尺寸 |
| `info.previewShape` | `rectangle`、`square` | 悬停预览的形状 |
| `info.showDiagnostics` | `true`、`false` | 悬停中的解析提示 |
| `info.showSpecLevel` | `true`、`false` | 悬停中的规范层级 |
| `convert.enabled` | `true`、`false` | 转换命令 |
| `convert.alphaLoss` | `reject`、`confirm`、`drop` | 目标格式无法表达 alpha 时的处理，见[转换与复制颜色](./convert.md#决定信息会丢失时怎么办) |
| `convert.missingComponentLoss` | `confirm`、`compute` | 无法保留 `none` 分量时的处理 |
| `convert.namedColorFallback` | `reject`、`nearest` | 没有完全匹配的颜色名时的处理 |
| `convert.recentFirst` | `true`、`false` | 最近用过的目标排在选择器最前 |
| `output.gamutMapping` | `css`、`clip`、`none` | 输出 sRGB 时的色域映射 |
| `output.hexCase` | `lower`、`upper` | 生成 hex 的大小写 |
| `scan.comments` | `true`、`false` | 注释里的颜色 |
| `scan.strings` | `true`、`false` | 字符串字面量里的颜色 |
| `variables.resolve` | `true`、`false` | 变量解析，见[解析变量](./variables.md) |
| `variables.lookupGlobs` | `["**/*.{css,scss,sass,less}"]` | 查找定义的文件范围 |
| `variables.maxIndexedFiles` | `2000`，0 到 100000 | 索引的样式表数量上限 |
| `variables.languageIds` | `null` 或语言 ID 列表 | 识别变量引用的语言 |
| `variables.maxResolveDepth` | `20`，1 到 100 | 引用嵌套的深度上限 |
| `contextualPreview` | `auto`、`light`、`dark`、`off` | `light-dark()` 假定的分支，见[支持的颜色语法](./color-support.md#依赖上下文的值) |
| `experimental.hdrAssumedHeadroom` | `0`，0 到 10 | 为 `hdr-color()` 假定的 HDR 余量；`0` 表示不预览 |
| `coexistence.notify` | `true`、`false` | 同时装了 Color Highlight（`naumovs.color-highlight`）、Color Info（`bierner.color-info`）或 Change Color Format（`bbugh.change-color-format`）时，每个工作区提醒一次 |
| `logLevel` | `warn`、`off`、`error`、`info`、`debug` | 输出面板的日志详细程度 |

## 让插件不处理某些文件

被排除的文件没有高亮、色块和悬停，命令也不起作用，而且根本不会被扫描。满足以下任一条件即排除：

- `disable.maxFileSizeMb`：文档长度超过此值。可以写小数，`0` 表示不限。**按 UTF-16 码元数计，不是磁盘上的字节数**，1 MB = 1,048,576 个码元：默认值 `0.3` 即 314,573 个码元，相当于约 307 KiB 的 ASCII 文本；中日韩等非 ASCII 文本的实际上限比文件大小看上去更宽松。
- `disable.fileNames`：只匹配文件名的 gitignore 风格模式。含 `/` 的模式会被忽略，并在输出面板中提示。
- `disable.languageIds`：同样的语法，匹配语言 ID，可以覆盖 `Dockerfile`、`Makefile` 或手动切换过语言的文件。

两个模式列表都是后写的条目优先，`!` 表示重新启用，所以 `["*.min.*", "*.map", "!theme.min.css"]` 会保留这一个压缩文件。取反只在本列表内有效，无法救回被另一个列表排除的文件。把列表设为 `[]` 即关闭对应条件。

## 运行环境

插件需要 VS Code 1.101 或更高版本，不依赖其他插件或工具。同一个包可在本地、远程和 Web 工作区中运行。在未受信任的工作区里，插件只读取已打开的文件，其他文件中定义的变量要等信任工作区后才能解析。

界面提供英文和简体中文（包括命令标题），跟随 VS Code 的显示语言；其他语言回退到英文。
