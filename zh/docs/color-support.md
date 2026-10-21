# 支持的颜色语法

[English](../../docs/color-support.md) · **简体中文**

这页列出支持哪些 CSS 颜色规范，并解释为什么有些值能识别却从不预览；不需要任何设置。「W3C Color Toolkit: 管理」→「显示规范支持矩阵」会按你当前的开关显示同一张矩阵。

## 查看规范层级

| 层级                             | 支持情况                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS Color 3                      | 支持，包括旧式逗号语法                                                                                                                                                     |
| CSS Color 4（ED 2026-07-28）     | 支持：全部 148 个颜色名、四种长度的 hex、`none`、静态 `calc()`、四种角度单位以及 10 个预定义的 `color()` 空间                                                              |
| CSS Color 5（ED 2026-07-31）     | 可静态求值的部分：`color-mix()`（含多颜色形式）、相对颜色语法、`alpha()`、`contrast-color()`、按朴素公式回退的 `device-cmyk()`，以及 `@color-profile` 的 `fallback` 描述符 |
| CSS Color 6（ED 2026-01-11）     | 实验功能，默认开启：`color-layers()`、扩展后的 `contrast-color()`、`wcag2` 与 `wcag2()`、`tbd-fg` 与 `tbd-bg`                                                              |
| CSS Color HDR 1（ED 2026-07-28） | 实验功能，默认开启：`ictcp()`、`jzazbz()`、`jzczhz()`、`color(rec2100-pq)`、`color(rec2100-hlg)`、`color(rec2100-linear)` 以及 `hdr-color()`                               |

两份草案都通过 `w3cColorToolkit.experimental` 开关；规范还在演进，取值和语法都可能变化。

## 依赖上下文的值

**取值随元素、主题或显示器变化的颜色，一律不用臆测值显示。** `currentColor`、19 个系统颜色、23 个已弃用的系统颜色、`light-dark()`、未解析的 `var()`、没有 `fallback` 的自定义 `@color-profile`，以及非静态的 alpha，插件都把它们视为依赖上下文的值。它们不参与转换；除非适用下面的预览假设，也不会高亮。悬停会说明这个值依赖什么，已弃用的系统颜色还会给出替代关键字。

- `light-dark()` 按 `advanced.contextualPreview` 选定的分支预览。默认值 `auto` 跟随当前编辑器主题，切换主题后重新渲染；`light` 和 `dark` 固定分支，`off` 关闭预览。悬停会把结果标注为假设值。
- `hdr-color()` 取决于显示器的 HDR 余量，即使开启 HDR 草案也仍然依赖上下文，除非把 `advanced.experimental.hdrAssumedHeadroom` 设为大于 `0` 的值。

## 近似计算

`device-cmyk()` 不使用 ICC 配置文件，而是按朴素公式换算，悬停会标注为近似值；插件从不下载远程 ICC 配置文件。广色域和 HDR 颜色的预览会映射到 sRGB，见[高亮与悬停](./highlight-and-hover.md#预览广色域与-hdr-颜色)。
