# W3C Color Toolkit

VS Code 的颜色高亮、悬停信息与格式转换扩展。三项功能共享同一套颜色内核,
支持 CSS Color 4 / 5 / 6 与 CSS Color HDR。

English: [README.md](./README.md)

## 为什么合成一个扩展

高亮、Hover 和转换共享**同一份**文档颜色索引, 因此三者对每个表达式的范围、颜色值、alpha、
原始色彩空间和解析状态必然一致, 不存在逐功能重复解析。

## 规范支持

| 层级 | 状态 |
| --- | --- |
| CSS Color 3 (legacy 逗号语法) | 支持 |
| CSS Color 4 (ED 2026-07-28) | 支持, 含 148 个命名颜色、四种 hex 长度、`none`、静态 `calc()`、四种角度单位与 10 个 `color()` 预定义空间 |
| CSS Color 5 (ED 2026-07-31) | 可静态求值部分: `color-mix()` (含多颜色形式)、相对颜色语法、`alpha()`、`contrast-color()`、`device-cmyk()` 朴素 fallback、`@color-profile` 的 `fallback` |
| CSS Color 6 (ED 2026-01-11) | 实验, **默认开启**, 可用 `w3cColorToolkit.experimental` 关闭: `color-layers()`、扩展 `contrast-color()`、`wcag2` / `wcag2()`、`tbd-fg` / `tbd-bg` |
| CSS Color HDR 1 (ED 2026-07-28) | 实验, **默认开启**, 同一开关: `ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq | rec2100-hlg | rec2100-linear)`、`hdr-color()` |

执行 **管理 → 显示规范支持矩阵** 可以看到按当前开关状态渲染的矩阵。

### 上下文相关的值不会被伪造

`currentColor`、19 个系统色、23 个 deprecated 系统色、`light-dark()`、未解析的 `var()`、
没有 `fallback` 的自定义 `@color-profile`, 以及非静态 alpha, 一律得到 `contextual` 状态。
它们不允许转换; 没有显式预览假设时也不会被高亮, Hover 只显示它们依赖什么,
而不是给出一个编出来的色块。deprecated 系统色还会提示替代关键字。

其中只有一种可以不靠猜就预览: `light-dark()` 按 `advanced.contextualPreview` 选择分支,
该项默认 `auto`, 跟随当前编辑器主题。Hover 仍把结果标注为假设值, 切换主题会重新渲染;
设为 `off` 可回到完全不预览。

`hdr-color()` 依赖显示器 HDR headroom, 因此即使开启 HDR 开关也保持上下文相关。

### 高亮与 Hover 共用一份字段表

`advanced.fields.enabled` / `advanced.fields.excluded` 是两者唯一的范围来源,
不存在"高亮范围"这第二处配置:

| 分组 | 作用于 | 示例 |
| --- | --- | --- |
| CSS 格式 | Hover 行**与**高亮 | `hex`、`rgb`、`oklch`、`display-p3`、`rec2100-pq`、`css-color-name` |
| CSS 语法 (只读) | 仅高亮 | `color-mix`、`relative-color`、`light-dark`、`contrast-color`、`system-color`、`device-cmyk`、`transparent`、`current-color`、`color-layers`、`color-custom-profile`、`hdr-color` |
| 非 CSS 表示 | 仅 Hover | `hsv`、`cmyk` |
| 附加信息 (不构成完整颜色) | 仅 Hover | `preview`、`source`、`spec-level`、`diagnostics`、`alpha`、`gamut`、`contrast-on-white`、`contrast-on-black` |

关掉一个 CSS 语法即停止高亮它; 关掉一个格式同时移除对应的 Hover 行。
`配置颜色字段` 命令按同样的分组展示, 并在每个条目上标出生效范围。
注册表未登记的语法一律放行, 因此解析器新增语法不会静默失去高亮。

### 行内色块与原生取色器

本扩展注册了 `DocumentColorProvider`, 因此 VS Code 会在颜色前画**行内色块**, 并在 Hover 中提供
**原生取色器** —— 包括 VS Code 自带提供器都不覆盖的 `oklch()`、`lab()`、`color()`、`color-mix()`、
相对颜色、HDR 空间, 以及注释与字符串里的颜色。色块范围与高亮共用同一份字段表。

取色器挂在色块上 (VS Code 只在存在颜色**装饰**的位置产出取色器), 所以"只要取色器不要色块"做不到;
关掉 `editor.colorDecorators` 会把两者一起关掉。

用取色器改色时**优先按原格式写回** (依次回退到 hex、rgb、hsl、oklch), 并跳过无法表达当前 alpha
的格式。不是单纯颜色的值 —— 上下文相关值 (`light-dark()`、系统色等) 与只读语法 (`color-mix()`、
相对颜色、`contrast-color()`、`device-cmyk()`、`color-layers()`) —— 只给**只读色块**:
不提供候选写法, 因此误拖一下不会把整个表达式压成字面值。确实要改这类值请用"转换颜色"命令。

`advanced.colorPicker.mode`:

| 取值 | 行为 |
| --- | --- |
| `dedupe` (默认) | 在 `css` / `less` / `scss` (内置 CSS 提供器会给颜色的三种语言) 里按文档版本探测一次其他提供器, 只上报它们没覆盖的 range; 其他语言全量上报。任何颜色都不会出现两个色块。 |
| `all` | 所有语言上报全部受支持语法, 即使别人已经给过。 |
| `off` | 不提供, 交回 VS Code 自己的提供器。 |

为什么需要探测: VS Code 把**所有**颜色提供器的结果叠加渲染且不按 range 去重; 只要有扩展返回了
数组 (哪怕空数组) 它就不再使用内置**默认**提供器; 而 `vscode.executeDocumentColorProvider`
不回传"这个颜色是谁给的"。按 range 探测是保证"一个颜色一个色块"的唯一办法。

同理, 本扩展通过 `contributes.configurationDefaults` 把 `"editor.defaultColorDecorators"` 的默认值
设为 `never`: 内置默认提供器认的 hex、`rgb()`、`hsl()` 是本扩展上报范围的真子集, 关掉它只去掉重叠,
不损失覆盖。设置界面会显示"默认值被扩展覆盖", 你随时可以改回 `auto` 或 `always`。

两个上限值得知道: VS Code 每个编辑器最多渲染 `editor.colorDecoratorsLimit` (默认 **500**) 个色块 ——
本扩展会按该值截断上报并记一次日志; `editor.colorDecoratorsActivatedOn` 决定取色器是悬停打开、
点击打开还是两者都可。

如果希望色块完全不依赖 VS Code 的颜色功能, 可以把 marker 样式设为 `square-before` / `square-after`:
由本扩展自己的装饰画实心方块, 所有语言与所有位置都有, 只受 `advanced.highlight.maxMatchesPerDocument` 限制。

## 配置

设置界面只出现 8 个键:

| 配置键 | 默认值 | 作用 |
| --- | --- | --- |
| `w3cColorToolkit.enabled` | `true` | 总开关 |
| `w3cColorToolkit.languages` | `["*"]` | 语言过滤; `!id` 为排除项, 排除优先 |
| `w3cColorToolkit.highlight` | `underline` | 标记样式: `background`、`foreground`、`outline`、`underline`、`dot-before`、`dot-after`、`square-before`、`square-after`; `off` 关闭高亮 |
| `w3cColorToolkit.info` | `true` | 悬停信息 |
| `w3cColorToolkit.convertSyntax` | `legacy` | `rgb()` / `hsl()` 输出风格 |
| `w3cColorToolkit.precision` | `5` | 有效数字位数 |
| `w3cColorToolkit.experimental` | `["cssColor6", "cssColorHdr"]` | `cssColor6`、`cssColorHdr`; 两项默认都开启 |
| `w3cColorToolkit.advanced` | `{}` | 35 项内置选项的增量覆盖 |

其余选项都有内置默认值, 通过 `w3cColorToolkit.advanced` 用点分键**增量覆盖**:

```jsonc
{
  "w3cColorToolkit.advanced": {
    "output.hexCase": "upper",
    "highlight.maxMatchesPerDocument": 3000,
    "variables.includePaths": ["src/styles"]
  }
}
```

规则:

- 未出现的键保持内置默认值; 数组与对象整体替换;
- 8 个顶层设置**不允许**出现在这里, 出现即忽略并告警, 从而消除两层之间的优先级歧义;
- 未知键与类型不符被忽略, 数值越界被钳制, 所有情况都记入日志而不抛异常;
- User / Workspace / Folder 三个 scope 由扩展**逐键合并**, 因为 VS Code 对 object 类型设置是整体替换;
- **管理 → 显示生效配置** 会输出合并结果并标注每个键的来源。

## 命令

命令面板中只出现 5 个入口:

| 命令 | 作用 |
| --- | --- |
| `转换颜色` | 一级 Quick Pick, 按分类分组展示 |
| `复制颜色为` | 同一套选择器, 结果写入剪贴板 |
| `启用功能` | 多选 Quick Pick 勾选功能开关 |
| `配置颜色字段` | 多选 Quick Pick 勾选 Hover 行与高亮语法共用的字段表 |
| `管理` | 迁移、生效配置、支持矩阵、重扫、清缓存、日志 |

24 个直达 `w3cColorToolkit.convertTo.*` 命令与 7 个管理动作在命令面板中隐藏, 但**完全可绑定**:
它们仍会出现在键盘快捷方式界面。本扩展不内置任何默认快捷键, 以免与既有绑定冲突:

```jsonc
// keybindings.json
[
  { "key": "ctrl+alt+h", "command": "w3cColorToolkit.convertTo.hex", "when": "editorTextFocus" },
  { "key": "ctrl+alt+o", "command": "w3cColorToolkit.convertTo.oklch", "when": "editorTextFocus" },
  {
    "key": "ctrl+alt+p",
    "command": "w3cColorToolkit.convertTo.rec2100Pq",
    "when": "editorTextFocus && w3cColorToolkit.hdrEnabled"
  }
]
```

## 从原扩展迁移

**管理 → 迁移旧插件设置** 会读取显式设置的 `color-highlight.*` 与 `colorInfo.*`, 生成预览,
确认后才写入。它不会修改旧配置, 可重复执行且幂等, 每个 scope 写回同一 scope。

| 旧命令 | 新命令 |
| --- | --- |
| `extension.changeColorFormat.commands` | `w3cColorToolkit.convert` |
| `extension.changeColorFormat.hexSmartConvert` | `w3cColorToolkit.convertTo.hex` (隐藏, 可绑定) |
| `extension.changeColorFormat.hslSmartConvert` | `w3cColorToolkit.convertTo.hsl` (隐藏, 可绑定) |
| `extension.changeColorFormat.rgbSmartConvert` | `w3cColorToolkit.convertTo.rgb` (隐藏, 可绑定) |
| `extension.colorHighlight` | `w3cColorToolkit.toggleFeatures` |

`color-highlight.enable` 与 `color-highlight.markerType` 合并为单个 `w3cColorToolkit.highlight`;
`colorInfo` 的四个 preview 字段变体折叠为 `preview` 字段加 `info.previewSize`、`info.previewShape`。

### 与原扩展并存

检测到原扩展时, 本扩展在**每个工作区最多提示一次**可能的重复高亮/Hover/命令问题。
它不会禁用、卸载或修改原扩展, 也不注册原命令 id。
把 `advanced.coexistence.notify` 设为 `false` 可关闭提示。

## 色域与 HDR 处理

- sRGB 输出默认使用 CSS 规范的色域映射, 而不是逐通道裁剪
  (`advanced.output.gamutMapping` 可切换为 `clip` 或 `none`)。
- 广色域颜色只在预览色块上做映射; Hover 仍显示原始值与色域状态。
- HDR 颜色在预览时做色调映射 (`advanced.highlight.hdrToneMapping`), 并在 Hover 中标注。
- 转换前会明确告知是否发生色域映射、是否丢弃 alpha、是否丢失 `none` 分量;
  默认策略是拒绝而不是静默丢信息。

## 已知限制

- 超大文档的扫描速度低于性能预算, 优化项见方案文档;
  `advanced.scan.maxDocumentSizeKb` 与 `advanced.highlight.maxMatchesPerDocument` 用于限制开销。
- CSS Color 6 与 CSS Color HDR 均为草案, 数值与语法可能变化。
- 未受信任的工作区只解析当前文档中的变量。
- 不下载远程 ICC profile; `device-cmyk()` 使用朴素 fallback 并标记为近似。

## 界面语言

英语与简体中文。其他 locale 回退到英语。

## 许可

MIT。三个参考扩展的使用方式见 [NOTICE.md](./NOTICE.md)。
