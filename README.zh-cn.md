# W3C Color Toolkit

VS Code 的颜色高亮、Hover 信息、行内色块与原生取色器, 以及格式转换 —— 全部由**同一套**颜色内核驱动,
支持 CSS Color 3 / 4 / 5 / 6 与 CSS Color HDR。

English: [README.md](./README.md) · 变更记录: [CHANGELOG.md](./CHANGELOG.md)

---

## 功能一览

| 功能 | 表现形式 | 开关 |
| --- | --- | --- |
| **颜色高亮** | 在编辑器里给颜色加标记, 并在概览标尺上打点 | `w3cColorToolkit.highlight` |
| **Hover 信息** | 悬停颜色时显示预览色块与各格式取值 | `w3cColorToolkit.info` |
| **行内色块 + 取色器** | VS Code 原生色块画在颜色前, 取色器从色块打开 | `advanced.colorPicker.mode` |
| **格式转换** | `转换颜色` / `复制颜色为`, 或 24 个直达命令 | `advanced.convert.enabled` |
| **变量解析** | `var(--brand)`、`$brand`、`@brand` 解析为真实颜色 | `advanced.variables.resolve` |

五项功能读取**同一份**文档颜色索引, 因此对每个表达式的范围、颜色值、alpha、原始色彩空间与解析状态
必然一致, 不存在逐功能重复解析。

## 运行要求

- VS Code **1.101** 或更高版本。
- 不依赖其他扩展或外部工具。
- 支持远程工作区与 VS Code for the Web (扩展提供 browser bundle)。
- **未受信任**的工作区只解析当前文档内的变量, 不读取被导入的文件。

## 快速上手

1. 安装扩展。启动完成后自动激活, 不需要执行任何命令。
2. 打开任意含颜色的文件 —— 不限于 CSS。
3. **悬停**一个颜色: 得到预览色块、原始语法, 以及全部启用格式的取值。
4. **点击颜色前的行内色块**打开原生取色器, 就地改色。
5. 把光标放进一个颜色, 执行 **W3C Color Toolkit: 转换颜色** (或右键 → *W3C Color Toolkit* →
   *转换颜色*), 即可改写为其他格式。
6. 执行 **启用功能** 可在一个 Quick Pick 里开关五项功能; **配置颜色字段** 用于精确指定
   哪些格式与语法在范围内。

以上均为开箱默认行为。下面的章节是需要调整时的参考。

---

## 功能详解

### 颜色高亮

`w3cColorToolkit.highlight` 为整个扩展选择一种标记样式:

| 取值 | 效果 |
| --- | --- |
| `underline` *(默认)* | 按颜色画下划线 |
| `background` | 文字背景填色, 并自动选取可读的前景色 |
| `foreground` | 直接给文字上色 |
| `outline` | 2px 描边 |
| `dot-before` / `dot-after` | 在值前 / 后加圆点 |
| `square-before` / `square-after` | 在值前 / 后加实心方块 |
| `off` | 关闭高亮 |

`square-before` / `square-after` 由本扩展**自己的装饰**绘制, 所有语言与所有位置都生效,
完全不依赖 VS Code 的颜色功能 —— 关掉行内色块又想要可见色块时用它。

相关选项: `advanced.highlight.markRuler` (概览标尺打点)、
`advanced.highlight.maxMatchesPerDocument`、`advanced.scan.comments`、`advanced.scan.strings`、
`advanced.highlight.matchWords` (裸颜色名在哪些语言里算颜色)。

### Hover 信息

悬停时按此顺序渲染: 预览色块 → 原始文本 → 每个启用格式一行 → 非 CSS 表示 (`hsv`、`cmyk`) →
元信息 (规范层级、解析说明, 以及你手动开启的 alpha、色域与两个对比度)。

```
▇▇▇  (预览)
原始语法: oklch(70% 0.2 30)
Hex: #f0703f
rgb(): rgb(240, 112, 63)
…
规范层级: CSS Color 4
```

色块外观: `advanced.info.previewSize` (`small` / `large`) 与
`advanced.info.previewShape` (`square` / `rectangle`)。元信息行:
`advanced.info.showSpecLevel`、`advanced.info.showDiagnostics`。

预览色块是本地 SVG data URI, 只用经过净化的数值拼装, 原始文本绝不参与拼接。

### 行内色块与原生取色器

本扩展注册了 `DocumentColorProvider`, 因此 VS Code 会在颜色前画**行内色块**, 并从色块提供
**原生取色器** —— 覆盖 `oklch()`、`lab()`、`color()`、`color-mix()`、相对颜色、HDR 空间,
以及注释与字符串里的颜色, 这些都是 VS Code 自带提供器不覆盖的。

用取色器改色时**优先按原格式写回**, 依次回退到 hex、rgb、hsl、oklch, 并跳过无法表达当前 alpha
的格式。

不是单纯颜色的值只给**只读色块** —— 能看到颜色但不提供改写候选, 因此误拖一下不会把表达式压成字面值:

- 上下文相关值: `light-dark()`、系统色、`currentColor`、未解析的 `var()`;
- 只读语法: `color-mix()`、相对颜色、`contrast-color()`、`device-cmyk()`、`color-layers()`。

确实要改这类值时请用"转换颜色"命令。

`advanced.colorPicker.mode`:

| 取值 | 行为 |
| --- | --- |
| `dedupe` *(默认)* | 在 `css` / `less` / `scss` (VS Code 内置 CSS 提供器也会给颜色的三种语言) 里按文档版本探测一次其他提供器, 只上报它们没覆盖的 range; 其他语言全量上报。任何颜色都不会出现两个色块。 |
| `all` | 所有语言上报全部受支持语法, 即使别人已经给过。 |
| `off` | 不提供, 交回 VS Code 自己的提供器。 |

两个 VS Code 上限会生效: 每个编辑器最多渲染 `editor.colorDecoratorsLimit` (默认 **500**) 个色块 ——
本扩展按该值截断上报并记一次日志; `editor.colorDecoratorsActivatedOn` 决定取色器是悬停打开、
点击打开还是两者都可。

### 格式转换与复制

**转换颜色**改写文档中的值; **复制颜色为**写入剪贴板, 不改动文档。两者共用同一套按分类分组的选择器。

| 分类 | 目标格式 |
| --- | --- |
| 常用 (4) | `#RRGGBB`、`rgb()`、`hsl()`、`oklch()` |
| 感知空间 (4) | `hwb()`、`lab()`、`lch()`、`oklab()` |
| `color()` 预定义空间 (9) | `srgb`、`srgb-linear`、`display-p3`、`display-p3-linear`、`a98-rgb`、`prophoto-rgb`、`rec2020`、`xyz-d50`、`xyz-d65` |
| 颜色名 (1) | `<named-color>` |
| HDR (6, 实验) | `ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq)`、`color(rec2100-hlg)`、`color(rec2100-linear)` |

目标颜色的取法:

- **空选区** → 光标所在的颜色。
- **非空选区** → 必须完整覆盖单个颜色表达式; 部分选中会被判定为无效, 而不是替你猜。
- 支持**多选区**。先解析全部选区, 只有**每个**都成功才执行一次写入, 因此不会出现改了一半的文件。

写入前会明确告知是否发生色域映射、是否丢弃 alpha、是否丢失 `none` 分量。默认策略是**拒绝**而不是
静默丢信息, 见 `advanced.convert.alphaLoss`、`advanced.convert.missingComponentLoss`、
`advanced.convert.namedColorFallback`。

输出风格: `w3cColorToolkit.convertSyntax` (`rgb()` / `hsl()` 用 `legacy` 逗号还是 `modern` 空格)、
`w3cColorToolkit.precision`、`advanced.output.hexCase`、`advanced.output.gamutMapping`。

### 变量解析

| 语言 | 可解析 |
| --- | --- |
| 任意 | CSS 自定义属性 (`--brand`, 通过 `var()` 使用) |
| `scss`、`sass` | `$brand` |
| `less` | `@brand` |
| `stylus` | `brand = …` |

`@import` / `@use` / `@forward` 会跨文件跟踪, 受 `advanced.variables.maxImportDepth`、
`advanced.variables.maxImportFiles` 与循环检测三重限制。用
`advanced.variables.includePaths` 追加工作区相对搜索根。
`@color-profile --name { fallback: … }` 同样会被收集, 因此 `color(--name …)` 可以解析。

### 上下文相关的值不会被伪造

`currentColor`、19 个系统色、23 个 deprecated 系统色、`light-dark()`、未解析的 `var()`、
没有 `fallback` 的自定义 `@color-profile`, 以及非静态 alpha, 一律得到 `contextual` 状态。
它们不允许转换; 没有显式预览假设时也不会被高亮 —— Hover 只说明**这个值依赖什么**,
而不是给出一个编出来的色块。deprecated 系统色还会提示替代关键字。

只有一种可以不靠猜就预览: `light-dark()` 按 `advanced.contextualPreview` 选择分支, 该项默认 `auto`,
跟随当前编辑器主题。Hover 仍把结果标注为假设值, 切换主题会重新渲染; 设为 `off` 可回到完全不预览。

`hdr-color()` 依赖显示器 HDR headroom, 因此即使开启 HDR 开关也保持上下文相关 ——
除非用 `advanced.experimental.hdrAssumedHeadroom` 声明一个假设值。

---

## 命令

命令面板中出现 5 个入口 (分类为 **W3C Color Toolkit**):

| 命令 | 命令 id | 作用 |
| --- | --- | --- |
| 转换颜色 | `w3cColorToolkit.convert` | 选择目标格式并改写值 |
| 复制颜色为 | `w3cColorToolkit.copyColorAs` | 同一套选择器, 结果写入剪贴板 |
| 启用功能 | `w3cColorToolkit.toggleFeatures` | 多选: 高亮、色块与取色器、Hover、转换、变量解析、CSS Color 6、CSS Color HDR |
| 配置颜色字段 | `w3cColorToolkit.configureColorFields` | 多选 Hover 行与高亮语法共用的字段表 |
| 管理 | `w3cColorToolkit.manage` | 下列 7 个维护动作的入口 |

*转换颜色* 与 *复制颜色为* 同时出现在编辑器右键菜单的 **W3C Color Toolkit** 子菜单里。

**管理**动作 (同时注册为独立命令 id):

| 动作 | 命令 id |
| --- | --- |
| 迁移旧插件设置 | `w3cColorToolkit.migrateLegacySettings` |
| 显示生效配置 | `w3cColorToolkit.showEffectiveConfiguration` |
| 显示规范支持矩阵 | `w3cColorToolkit.showSupportMatrix` |
| 重扫当前文档 | `w3cColorToolkit.rescanDocument` |
| 清除索引缓存 | `w3cColorToolkit.clearIndexCache` |
| 打开日志 | `w3cColorToolkit.showOutputChannel` |
| 记录未支持语法 | `w3cColorToolkit.reportUnsupportedSyntax` |

*迁移旧插件设置* 会把你为旧版颜色插件显式设置过的配置导入到对应的 `w3cColorToolkit` 键上:
先给预览, 确认后才写入, 不修改旧配置, 每个 scope 写回同一 scope, 重复执行结果一致。

### 快捷键

24 个直达 `w3cColorToolkit.convertTo.*` 命令与 7 个管理动作在命令面板中隐藏, 但**完全可绑定** ——
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

命令 id 后缀与格式表一致: `hex`、`rgb`、`hsl`、`oklch`、`hwb`、`lab`、`lch`、`oklab`、`srgb`、
`srgbLinear`、`displayP3`、`displayP3Linear`、`a98Rgb`、`prophotoRgb`、`rec2020`、`xyzD50`、
`xyzD65`、`namedColor`、`ictcp`、`jzazbz`、`jzczhz`、`rec2100Pq`、`rec2100Hlg`、`rec2100Linear`。

---

## 配置

### 设置界面中的 8 个键

| 配置键 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `w3cColorToolkit.enabled` | boolean | `true` | 总开关 |
| `w3cColorToolkit.languages` | string[] | `["*"]` | 语言过滤; `"*"` 为全部, `"!id"` 为排除项, 排除优先 |
| `w3cColorToolkit.highlight` | enum | `underline` | 标记样式, 或 `off` |
| `w3cColorToolkit.info` | boolean | `true` | Hover 信息 |
| `w3cColorToolkit.convertSyntax` | `modern` \| `legacy` | `legacy` | `rgb()` / `hsl()` 输出风格 |
| `w3cColorToolkit.precision` | 整数 1–10 | `5` | 生成值的有效数字位数 |
| `w3cColorToolkit.experimental` | string[] | `["cssColor6", "cssColorHdr"]` | 启用的草案规范; 两项默认都开启 |
| `w3cColorToolkit.advanced` | object | `{}` | 35 项内置选项的增量覆盖 |

8 个键的 scope 均为 `resource`, 因此可以按文件夹分别设置。

### advanced 对象

其余选项都有内置默认值, 通过 `w3cColorToolkit.advanced` 用扁平点分键**增量覆盖**:

```jsonc
{
  "w3cColorToolkit.advanced": {
    "output.hexCase": "upper",
    "highlight.maxMatchesPerDocument": 3000,
    "variables.includePaths": ["src/styles"]
  }
}
```

在 `settings.json` 中于对象内输入 `"` 即可获得逐键补全、悬停说明与取值范围校验。内置两个片段:
*All advanced options (with defaults)* 与 *Minimal example*。

规则:

- 未出现的键保持内置默认值; 数组与对象整体替换;
- 8 个顶层设置**不允许**出现在这里, 出现即忽略并告警, 从而消除两层之间的优先级歧义;
- 未知键与类型不符被忽略, 数值越界被钳制, 所有情况都记入日志而不抛异常;
- User / Workspace / Folder 三个 scope 由扩展**逐键合并**, 因为 VS Code 对 object 类型设置是整体替换;
- **管理 → 显示生效配置** 会输出合并结果并标注每个键的来源。

#### 全部 35 项

**高亮**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `highlight.markRuler` | boolean | `true` | 在概览标尺上显示标记 |
| `highlight.matchWords` | `off` \| `css-like` \| `all` | `css-like` | 裸颜色名在哪里算颜色: 都不算、仅 CSS 系语言 (`css`、`scss`、`sass`、`less`、`stylus`、`postcss`)、或所有语言 |
| `highlight.hexAlphaOrder` | `rgba` \| `argb` | `rgba` | 八位 hex 的解读: `#RRGGBBAA` 还是 `#AARRGGBB` |
| `highlight.matchRgbWithoutFunction` | boolean | `false` | 把裸 `255, 136, 0` 识别为 RGB |
| `highlight.rgbWithoutFunctionLanguages` | string[] | `["*"]` | 裸 RGB 模式生效的语言 |
| `highlight.matchHslWithoutFunction` | boolean | `false` | 把裸 `30, 100%, 50%` 识别为 HSL |
| `highlight.hslWithoutFunctionLanguages` | string[] | `["*"]` | 裸 HSL 模式生效的语言 |
| `highlight.maxMatchesPerDocument` | 整数 1–1000000 | `10000` | 单文档超过该数量后停止高亮 |
| `highlight.hdrToneMapping` | `none` \| `reinhard` \| `clip` | `reinhard` | 预览 HDR 颜色时使用的色调映射 |

**取色器**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `colorPicker.mode` | `off` \| `dedupe` \| `all` | `dedupe` | 行内色块与原生取色器, 见上文表格 |

**字段表 (Hover *与* 高亮)**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `fields.enabled` | string[] \| null | `null` | 有序字段列表; `null` 表示默认顺序 |
| `fields.excluded` | string[] | `[]` | 要关闭的字段; 排除优先 |

**Hover**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `info.previewSize` | `small` \| `large` | `small` | Hover 色块尺寸 |
| `info.previewShape` | `square` \| `rectangle` | `rectangle` | Hover 色块形状 |
| `info.showDiagnostics` | boolean | `true` | 显示解析说明 |
| `info.showSpecLevel` | boolean | `true` | 显示语法来自哪个规范层级 |

**转换**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `convert.enabled` | boolean | `true` | 启用转换命令 |
| `convert.alphaLoss` | `reject` \| `confirm` \| `drop` | `reject` | 目标格式无法表达 alpha 时的处理 |
| `convert.missingComponentLoss` | `confirm` \| `compute` | `confirm` | `none` 分量无法保留时的处理 |
| `convert.namedColorFallback` | `reject` \| `nearest` | `reject` | 没有完全匹配的颜色名时的处理 |
| `convert.recentFirst` | boolean | `true` | 最近使用的目标格式排在选择器前面 |

**输出**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `output.gamutMapping` | `css` \| `clip` \| `none` | `css` | sRGB 输出的色域映射策略 |
| `output.hexCase` | `lower` \| `upper` | `lower` | 生成 hex 的字母大小写 |

**扫描**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `scan.comments` | boolean | `true` | 扫描注释中的颜色 |
| `scan.strings` | boolean | `true` | 扫描字符串字面量中的颜色 |
| `scan.maxDocumentSizeKb` | 整数 1–102400 | `2048` | 跳过大于该尺寸的文档 |

**变量**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `variables.resolve` | boolean | `true` | 解析自定义属性与预处理器变量 |
| `variables.includePaths` | string[] | `[]` | 导入查找的额外工作区相对路径 |
| `variables.maxImportDepth` | 整数 0–100 | `20` | 最大导入深度 |
| `variables.maxImportFiles` | 整数 0–10000 | `200` | 最大导入文件数 |
| `variables.maxResolveDepth` | 整数 1–100 | `20` | 最大变量解析深度 |

**其他**

| 键 | 取值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `contextualPreview` | `off` \| `auto` \| `light` \| `dark` | `auto` | 预览 `light-dark()` 时假设的配色方案; 结果会标注为假设值 |
| `experimental.hdrAssumedHeadroom` | 数字 0–10 | `0` | 预览 `hdr-color()` 时假设的显示器 HDR headroom; `0` 表示不预览 |
| `coexistence.notify` | boolean | `true` | 检测到可能造成重复高亮 / Hover / 命令的其他颜色扩展时, 每个工作区提示一次 |
| `logLevel` | `off` \| `error` \| `warn` \| `info` \| `debug` | `warn` | 输出面板的日志级别 |

### 本扩展覆盖的一个默认值

本扩展通过 `contributes.configurationDefaults` 把 `"editor.defaultColorDecorators"` 的默认值设为
`never`: VS Code 内置**默认**提供器认的 hex、`rgb()`、`hsl()` 是本扩展上报范围的真子集,
关掉它只去掉重叠, 不损失覆盖。设置界面会显示"默认值被扩展覆盖", 你随时可以改回 `auto` 或 `always`。

---

## 颜色字段: 高亮与 Hover 共用一份表

`advanced.fields.enabled` / `advanced.fields.excluded` 是两者唯一的范围来源, 不存在"高亮范围"这
第二处配置。**配置颜色字段**命令按同样的分组展示, 并在每个条目上标出生效范围。

| 分组 | 作用于 | 字段 |
| --- | --- | --- |
| CSS 格式 | Hover 行**与**高亮 | `hex`、`rgb`、`hsl`、`hwb`、`lab`、`lch`、`oklab`、`oklch`、`color-srgb`、`color-srgb-linear`、`display-p3`、`color-display-p3-linear`、`a98-rgb`、`prophoto-rgb`、`rec2020`、`xyz-d50`、`xyz-d65`、`ictcp`†、`jzazbz`†、`jzczhz`†、`rec2100-pq`†、`rec2100-hlg`†、`rec2100-linear`†、`css-color-name` |
| CSS 语法 (只读) | 仅高亮 | `transparent`、`color-mix`、`relative-color`、`contrast-color`、`color-layers`、`light-dark`、`device-cmyk`、`color-custom-profile`、`current-color`、`system-color`、`hdr-color`† |
| 非 CSS 表示 | 仅 Hover | `hsv`、`cmyk` |
| 附加信息 (不构成完整颜色) | 仅 Hover | `preview`、`source`、`spec-level`、`diagnostics`、`alpha`\*、`gamut`\*、`contrast-on-white`\*、`contrast-on-black`\* |

† 需要 `cssColorHdr` 实验开关。\* 默认关闭 —— 需要时加入 `fields.enabled`, 或在*配置颜色字段*里勾选。
(alpha 已经体现在 `#ff880080` 这类序列化结果里; 色域与两个对比度属于诊断性信息, 日常查看时是噪音。)

关掉一个 CSS 语法即停止高亮它; 关掉一个格式同时移除对应的 Hover 行。
注册表未登记的语法一律放行, 因此解析器新增语法不会静默失去高亮。

`fields.enabled` 的顺序即 Hover 行的顺序。*配置颜色字段*始终按注册表顺序写回 ——
需要自定义顺序请直接编辑 `fields.enabled`。

---

## 规范支持

| 层级 | 状态 |
| --- | --- |
| CSS Color 3 (legacy 逗号语法) | 支持 |
| CSS Color 4 (ED 2026-07-28) | 支持, 含 148 个命名颜色、四种 hex 长度、`none`、静态 `calc()`、四种角度单位与 10 个 `color()` 预定义空间 |
| CSS Color 5 (ED 2026-07-31) | 可静态求值部分: `color-mix()` (含多颜色形式)、相对颜色语法、`alpha()`、`contrast-color()`、`device-cmyk()` 朴素 fallback、`@color-profile` 的 `fallback` |
| CSS Color 6 (ED 2026-01-11) | 实验, **默认开启**, 可用 `w3cColorToolkit.experimental` 关闭: `color-layers()`、扩展 `contrast-color()`、`wcag2` / `wcag2()`、`tbd-fg` / `tbd-bg` |
| CSS Color HDR 1 (ED 2026-07-28) | 实验, **默认开启**, 同一开关: `ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq \| rec2100-hlg \| rec2100-linear)`、`hdr-color()` |

执行 **管理 → 显示规范支持矩阵** 可以看到按当前开关状态渲染的矩阵。

### 色域与 HDR 处理

- sRGB 输出默认使用 CSS 规范的色域映射, 而不是逐通道裁剪
  (`advanced.output.gamutMapping` 可切换为 `clip` 或 `none`)。
- 广色域颜色只在预览色块上做映射; Hover 仍显示原始值与色域状态。
- HDR 颜色在预览时做色调映射 (`advanced.highlight.hdrToneMapping`), 并在 Hover 中标注。

---

## 排查

**看不到行内色块。** 依次检查 `editor.colorDecorators` (VS Code 自己的总开关)、
`advanced.colorPicker.mode` (不能为 `off`), 以及文件颜色数是否超过
`editor.colorDecoratorsLimit` (500) —— 本扩展会在该上限处截断并记日志。取色器挂在色块上,
所以"只要取色器不要色块"做不到。

**一个颜色出现两个色块。** 要么 `colorPicker.mode` 是 `all`, 要么另一个颜色扩展也在上报该 range。
`dedupe` 只探测 VS Code 内置 CSS 提供器, 且只在 `css`、`less`、`scss` 里探测。

*为什么需要探测:* VS Code 把**所有**颜色提供器的结果叠加渲染且不按 range 去重; 只要有扩展返回了
数组 (哪怕空数组) 它就不再使用内置**默认**提供器; 而 `vscode.executeDocumentColorProvider`
不回传"这个颜色是谁给的"。按 range 探测是保证"一个颜色一个色块"的唯一办法。

**某个颜色没有高亮。** 按可能性排序: `w3cColorToolkit.highlight` 为 `off`;
该语言被 `w3cColorToolkit.languages` 排除; 对应语法的字段在*配置颜色字段*里被关掉;
该值是上下文相关值 (见上文); 文档超过 `advanced.scan.maxDocumentSizeKb`;
颜色数超过 `advanced.highlight.maxMatchesPerDocument`; 或者它是非 CSS 语言里的裸颜色名而
`advanced.highlight.matchWords` 仍为 `css-like`。

**取色器不提供改写方式。** 那是上下文相关值与只读语法的只读色块。要有意改写请用"转换颜色"。

**转换被拒绝。** 提示会给出原因和行号: 上下文相关值、目标格式无法表达 alpha
(`convert.alphaLoss`)、或没有完全匹配的颜色名 (`convert.namedColorFallback`)。
放宽相应策略, 或换一个目标格式。

**`var(--x)` 一直未解析。** 检查 `advanced.variables.resolve`, 把样式根目录加入
`advanced.variables.includePaths`, 并注意未受信任的工作区不读取被导入的文件。
导入遍历受 `variables.maxImportDepth` / `maxImportFiles` / `maxResolveDepth` 限制。

**`advanced` 里的某个键像是没生效。** 执行 **管理 → 显示生效配置**, 它会打印每个键及其来源 scope,
并列出被拒绝的键。把 `advanced.logLevel` 设为 `debug` 后从 **管理 → 打开日志** 看细节。

**结果看起来是旧的。** 执行 **管理 → 重扫当前文档** 或 **清除索引缓存**。
遇到本扩展不认识的语法时, **管理 → 记录未支持语法** 会把它记入日志, 方便提 issue。

---

## 已知限制

- 超大文档的扫描速度低于目标性能预算; `advanced.scan.maxDocumentSizeKb` 与
  `advanced.highlight.maxMatchesPerDocument` 用于限制开销。
- CSS Color 6 与 CSS Color HDR 均为草案, 数值与语法可能变化。
- 未受信任的工作区只解析当前文档中的变量。
- 不下载远程 ICC profile; `device-cmyk()` 使用朴素 fallback 并标记为近似。

## 界面语言

英语与简体中文, 命令标题一并本地化。其他 locale 回退到英语。

## 许可

MIT, 见 [LICENSE.txt](./LICENSE.txt)。第三方声明见 [NOTICE.md](./NOTICE.md)。
