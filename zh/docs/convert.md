# 转换与复制颜色

[English](../../docs/convert.md) · **简体中文**

读完这页，你能把颜色改写或复制成另一种格式，并给常用的目标格式绑定快捷键；前提是 `advanced.convert.enabled` 为 `true`，这是默认值。

## 转换或复制光标处的颜色

「转换颜色」改写文档里的值；「复制颜色为」把转换结果放进剪贴板，文档保持不变。两者都在命令面板里，也在编辑器右键菜单的 W3C Color Toolkit 子菜单里，打开的是同一个按类别分组的选择器：

| 类别 | 目标格式 |
| --- | --- |
| 常用 | `#RRGGBB`、`rgb()`、`hsl()`、`oklch()` |
| 感知色彩空间 | `hwb()`、`lab()`、`lch()`、`oklab()` |
| `color()` 预定义空间 | `srgb`、`srgb-linear`、`display-p3`、`display-p3-linear`、`a98-rgb`、`prophoto-rgb`、`rec2020`、`xyz-d50`、`xyz-d65` |
| 颜色名 | `<named-color>` |
| HDR（实验） | `ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq)`、`color(rec2100-hlg)`、`color(rec2100-linear)` |

每一项在选择前就预览转换结果，并标出是否经过色域映射。`advanced.convert.recentFirst` 开启时（默认），最近用过的目标排在最前。

## 选定要转换的颜色

- 没有选区：转换光标处的颜色；颜色有嵌套时取最内层那个。
- 有选区：选区必须恰好覆盖一个完整的颜色表达式；只选中一部分会被判为无效，不会去猜。
- 多个选区：先全部转换，只有每一处都成功才一次性写入文档，不会出现转了一半的文件。

## 决定信息会丢失时怎么办

默认情况下，转换宁可拒绝也不悄悄丢信息，提示里会写明原因和所在行。

| 选项 | 何时生效 | 取值 |
| --- | --- | --- |
| `advanced.convert.alphaLoss` | 目标格式无法表达 alpha，例如把半透明颜色转成 `#RRGGBB` | `reject`（默认）、`confirm`、`drop` |
| `advanced.convert.missingComponentLoss` | 目标格式无法保留 `none` 分量 | `confirm`（默认）、`compute` |
| `advanced.convert.namedColorFallback` | 没有完全匹配的颜色名 | `reject`（默认）、`nearest` |

依赖上下文的值和已解析的变量引用一律不转换；提示会说明这个值依赖什么，或者来自哪个变量。

## 调整输出格式

| 选项 | 作用 |
| --- | --- |
| `w3cColorToolkit.convertSyntax` | `legacy`（默认）输出带逗号的 `rgb(255, 97, 76.8)`；`modern` 输出 `rgb(255 97 76.8)` |
| `w3cColorToolkit.precision` | 生成数值的有效数字位数，1 到 10（默认 3） |
| `advanced.output.hexCase` | hex 字母用小写 `lower`（默认）还是大写 `upper` |
| `advanced.output.gamutMapping` | 超出色域的颜色如何落到 sRGB 目标：`css`（默认，CSS Color 4 算法）、逐通道 `clip`，或 `none` |

## 给目标格式绑定快捷键

每种目标格式都有自己的命令 `w3cColorToolkit.convertTo.<target>`。它们不出现在命令面板里，但会列在键盘快捷方式编辑器中，搜索 `convertTo` 即可找到。插件不自带默认快捷键，在 `keybindings.json` 里自行添加：

```jsonc
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

HDR 目标只在 `w3cColorToolkit.experimental` 包含 `cssColorHdr` 时才会执行；用上下文键 `w3cColorToolkit.hdrEnabled` 可以让快捷键跟着这个开关走。
