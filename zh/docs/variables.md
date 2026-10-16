# 解析变量

[English](../../docs/variables.md) · **简体中文**

读完这页，你会知道 CSS 自定义属性和 SCSS、Less 变量怎样变成颜色，以及引用什么都不显示时该怎么办；前提是变量定义文件在工作区内，并且 `advanced.variables.resolve` 为 `true`，这是默认值。

## 哪些引用能解析

| 引用 | 在哪里解析 |
| --- | --- |
| `var(--brand)` | 所有变量语言，见下文 |
| `rgb(var(--channels) / 0.4)` | 同上；变量先代回颜色函数再解析 |
| `$brand` | `scss`、`sass` |
| `@brand` | `less` |
| Stylus 的 `brand` 或 `$brand` | 不解析；`.styl` 文件里的颜色照常识别 |

变量引用只在 `advanced.variables.languageIds` 列出的语言里识别。默认值 `null` 表示 `css`、`scss`、`sass`、`less`、`postcss` 和 `tailwindcss`；列入最后一项，是因为 Tailwind CSS IntelliSense 会把 CSS 文件切换成这个语言。

## 让插件找到变量定义文件

**变量定义按 glob 查找，不跟随 `@import`。** 样式表常由 JavaScript 打包工具合并，根本没有 CSS 层面的导入，顺着导入关系永远找不到定义文件。插件会为 `advanced.variables.lookupGlobs`（默认 `["**/*.{css,scss,sass,less}"]`）匹配到的每个文件建立索引，并用文件监视器保持更新。

- `@import`、`@use` 和 `@forward` 仍会补充 glob 没有覆盖到的文件。
- `node_modules`、`dist`、`out`、`build`、`coverage`、`.git`、`.next`、`.nuxt` 和 `.svelte-kit` 始终跳过。
- `advanced.variables.maxIndexedFiles`（默认 `2000`）限制索引的文件数。
- 已打开的文件直接读取编辑器内容，新定义不用保存就生效。
- 刚启动时索引还在建立，来自其他文件的颜色可能稍晚一点出现。

在未受信任的工作区里，只使用已打开文件中的定义，不读取磁盘上的其他文件。

## 一次查找的三种结果

1. 唯一：引用像普通颜色一样显示。自定义属性需要恰好一处无条件的根级定义（`:root`、`:host` 或 `html`，且不在 `@media` 等条件规则内）；`.button { --brand: … }` 这类组件级覆盖不影响判断。SCSS 或 Less 变量取同一文件里引用之前的最后一处定义，与 SCSS 从上往下编译到该处时取到的值相同。
2. 不唯一：悬停列出每个候选值及其出处，例如 `@media (prefers-color-scheme: dark) › :root`，但不显示色块，也不高亮。定义写在条件规则里，或只存在于 `[data-theme="dark"]`、`.dark` 这类选择器下时就是这种情况，因为取值取决于环境或元素。
3. 没有定义：什么都不显示，没有高亮、色块和悬停。这样 SCSS 文件里每个陌生的 `$foo` 都不会弹出一个空白的悬停框。

定义从真正的样式表语法树中读取，被注释掉的定义不会干扰真正的定义；某个文件有语法错误时，只有它自己的定义失效。

## 在颜色函数里使用变量

`rgb(var(--channels) / 0.4)`、`rgba(var(--x), 0.4)`、`hsl(var(--h) 50% 50%)` 和 `color-mix(in srgb, var(--a), red)` 都会先把变量代回文本再解析，Tailwind 风格的通道变量因此可以正常工作：

```css
:root { --channels: 148 163 184; }
.badge { background: rgb(var(--channels) / 0.4); }
```

- 找不到变量时使用回退值，例如 `var(--missing, 1 2 3)`。
- 循环引用，或嵌套深度超过 `advanced.variables.maxResolveDepth`（默认 `20`），都按没有定义处理。
- 变量不唯一时，每个候选值都会代回整个表达式，所以悬停显示的是 `rgb(148 163 184 / 0.4)`，而不是一串裸通道值。
- `rgba($brand, 0.4)` 这样使用的预处理器变量不会整体解析，因为代入后得到的是 SCSS 或 Less 自己的 `rgba(color, alpha)` 重载，而不是 CSS 语法；里面的 `$brand` 仍有自己的色块。

## 嵌套引用与已解析引用

引用里的每个颜色都有自己的色块：`var(--brand, #ff8800)` 显示两个，一个属于整个引用，一个属于回退值；`var(--a, var(--b, #674), #def)` 显示四个。高亮只标最外层的范围，下划线不会叠在一起。

**已解析的引用是只读的。** 取色器能显示它的颜色但不能拖动，「转换颜色」会拒绝并指出它依赖的变量，因为把 `var(--brand)` 改写成 `#ff8800` 会毁掉这个设计变量。

## 不会求值的写法

SCSS map、`@each`、mixin、算术运算以及 `darken()` 这类函数都不会求值，依赖它们的引用归入「没有定义」。Stylus 变量完全不解析：PostCSS 没有官方的 Stylus 解析器，唯一的第三方桥接又依赖只能在 Node 中运行的模块，会让插件无法在 VS Code for the Web 中运行。
