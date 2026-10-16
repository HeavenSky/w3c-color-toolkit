# 高亮与悬停

[English](../../docs/highlight-and-hover.md) · **简体中文**

读完这页，你能更换颜色上的标记样式，决定哪些语法带标记，以及悬停时显示哪些行；前提是插件已安装，并且你能编辑 `settings.json`。`advanced` 下的选项按[配置](./configuration.md#覆盖内置选项)中的方式设置。

## 选择标记样式

`w3cColorToolkit.highlight` 为整个插件统一选一种标记样式：

| 取值 | 效果 |
| --- | --- |
| `underline`（默认） | 用该颜色画下划线 |
| `background` | 给文字铺上背景色，并自动挑一个看得清的前景色 |
| `foreground` | 直接给文字上色 |
| `outline` | 在值外画 2px 描边 |
| `dot-before` / `dot-after` | 在值前或值后加圆点 |
| `square-before` / `square-after` | 在值前或值后加实心方块 |
| `off` | 不高亮 |

**`square-before` 和 `square-after` 由插件自己绘制**，所以在任何语言、任何位置都生效，不依赖 VS Code 的颜色功能。关掉行内色块后仍想看到一个色块时，就用它们。

`advanced.highlight.markRuler` 控制概览标尺上的打点。

## 选择哪些颜色参与

悬停和高亮共用一张字段表：关掉一个字段，它会按所属分组从悬停、高亮或两者中同时消失。执行「W3C Color Toolkit: 配置颜色字段」可以在 Quick Pick 里勾选字段，也可以直接编辑 `advanced.fields.enabled` 与 `advanced.fields.excluded`。

| 分组 | 作用范围 | 字段 |
| --- | --- | --- |
| CSS 格式 | 悬停行与高亮 | `hex`、`rgb`、`hsl`、`hwb`、`lab`、`lch`、`oklab`、`oklch`、`color-srgb`、`color-srgb-linear`、`display-p3`、`color-display-p3-linear`、`a98-rgb`、`prophoto-rgb`、`rec2020`、`xyz-d50`、`xyz-d65`、`ictcp`†、`jzazbz`†、`jzczhz`†、`rec2100-pq`†、`rec2100-hlg`†、`rec2100-linear`†、`css-color-name` |
| 只读 CSS 语法 | 仅高亮 | `transparent`、`color-mix`、`relative-color`、`contrast-color`、`color-layers`、`light-dark`、`device-cmyk`、`color-custom-profile`、`current-color`、`system-color`、`hdr-color`† |
| 非 CSS 表示 | 仅悬停 | `hsv`、`cmyk` |
| 附加信息 | 仅悬停 | `preview`、`source`、`spec-level`、`diagnostics`、`alpha`\*、`gamut`\*、`contrast-on-white`\*、`contrast-on-black`\* |

† 需要在 `w3cColorToolkit.experimental` 中启用 `cssColorHdr`。\* 默认关闭；把它加进 `fields.enabled`，或在「配置颜色字段」里勾选。

- `fields.enabled` 为 `null` 时使用默认列表；`fields.excluded` 中的排除项总是优先。
- 字段表不认识的语法一律高亮，新支持的语法不会悄悄丢掉标记。
- 「配置颜色字段」按默认顺序写回字段；想自定义悬停顺序，就直接编辑 `fields.enabled`。

另外几个选项决定扫描器看哪些地方：

| 选项 | 作用 |
| --- | --- |
| `advanced.highlight.matchWords` | `red` 这类裸颜色名在哪里算颜色：`off` 不算，`css-like` 只在类 CSS 语言（`css`、`scss`、`sass`、`less`、`stylus`、`postcss`）中算，`all` 在所有语言中都算 |
| `advanced.scan.comments`、`advanced.scan.strings` | 注释和字符串字面量里的颜色是否参与 |
| `advanced.highlight.hexAlphaOrder` | 8 位 hex 按 `#RRGGBBAA`（`rgba`）还是 `#AARRGGBB`（`argb`）解读 |
| `advanced.highlight.maxMatchesPerDocument` | 单个文档高亮到这个数量就停止；嵌套颜色分别计数，所以 `var(--a, #fff)` 算两个 |

## 调整悬停显示的内容

悬停按 `fields.enabled` 的顺序列出各行：默认依次是预览色块、原文、每种 CSS 格式各一行、`hsv` 与 `cmyk`，最后是规范层级和解析提示。以 `oklch(70% 0.2 30)` 为例，前几行是：

```text
原始语法: oklch(70% 0.2 30)
Hex: #ff614d
rgb(): rgb(255, 97, 76.8)
hsl(): hsl(6.66, 100%, 65.8%)
```

- `advanced.info.previewSize`（`small`、`large`）和 `advanced.info.previewShape`（`square`、`rectangle`）设置预览色块。
- `advanced.info.showSpecLevel` 与 `advanced.info.showDiagnostics` 用来隐藏规范层级行和解析提示；没有唯一取值的变量引用本来就不显示规范层级。
- 把 `w3cColorToolkit.info` 设为 `false` 会完全关闭悬停。

预览色块是本地生成的 SVG，只由清洗过的数值构成，原文不会被拼进去。

## 预览广色域与 HDR 颜色

预览一律映射到 sRGB，悬停里仍保留原值，并标明是否经过映射。广色域颜色使用 CSS 规定的色域映射算法；HDR 颜色按 `advanced.highlight.hdrToneMapping` 做色调映射（默认 `reinhard`，也可选 `clip`、`none`），并标注为已色调映射。`light-dark()` 的预览取决于 `advanced.contextualPreview`，见[支持的颜色语法](./color-support.md#依赖上下文的值)。
