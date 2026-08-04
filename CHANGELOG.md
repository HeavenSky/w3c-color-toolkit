# Changelog

本文件记录 W3C Color Toolkit 的显著变更。

## [0.0.1] - 2026-08-04

首个本地开发版本, 合并三个参考扩展的互补能力并共享统一颜色内核。

### 新增

- 统一颜色内核: 扫描、解析、求值、色域映射与序列化由高亮、Hover 和转换共享,
  三者对同一表达式得出相同的范围、颜色值、alpha、原始色彩空间与解析状态。
- CSS Color 4 完整静态语法: 148 个命名颜色、四种 hex 长度、legacy 与 modern 语法、
  百分比、alpha、四种角度单位、`none`、静态 `calc()`、10 个 `color()` 预定义空间。
- CSS Color 5 可静态求值部分: `color-mix()` (含三个及以上颜色形式与四种 hue 插值)、
  相对颜色语法、Relative Alpha Color `alpha()`、`contrast-color()`、
  `device-cmyk()` 无 ICC fallback、`@color-profile` 的 `fallback` 描述符。
- 上下文颜色分类: `currentColor`、19 个系统色、23 个 deprecated 系统色 (含替代关键字提示)、
  `light-dark()`、无 fallback 的自定义 profile、非静态 alpha, 一律返回 `contextual` 而不是黑色。
- CSS Color 6 实验支持 (默认开启, 可通过 `w3cColorToolkit.experimental` 关闭): `color-layers()`、
  扩展 `contrast-color()`、`wcag2` / `wcag2(aa | aaa | large)`、`tbd-fg` / `tbd-bg`。
- CSS Color HDR 1 实验支持 (默认开启, 同上开关): `ictcp()`、`jzazbz()`、`jzczhz()`、
  `color(rec2100-pq | rec2100-hlg | rec2100-linear)`, 以及恒为上下文相关的 `hdr-color()`。
- 三项功能: 六种 marker 的颜色高亮、可配置字段的 Hover 信息、24 个目标格式的转换。
- 两层配置: 8 个暴露层键 + `w3cColorToolkit.advanced` 的 34 项增量覆盖。
  `advanced` 自带三种就地参考: 中英文完整参考表格 (键 / 类型 / 默认值 / 说明)、
  可插入的全量与最小模板、逐键补全与悬停说明。
- 入口: 5 个命令面板命令、编辑器右键子菜单 (转换与复制), 以及 31 个可绑定快捷键的隐藏命令;
  不内置默认快捷键。
- 旧配置与旧命令迁移命令, 支持三个 scope 与幂等重复执行。
- 英语与简体中文界面。命令标题随界面语言变化: 英文界面为 `Convert Color`, 中文界面为 `转换颜色`。

### 已知限制

- 超大文档 (数千个颜色以上) 的扫描明显慢于目标预算, 正在优化;
  `advanced.scan.maxDocumentSizeKb` 与 `advanced.highlight.maxMatchesPerDocument` 用于限制开销。
- `hdr-color()` 与显示器 HDR headroom 相关, 只能按假设值预览。
- CSS Color 6 与 CSS Color HDR 均为草案, 数值与语法可能变化。
- 未受信任的工作区不跨文件解析变量。
- 不包含依赖 VS Code 运行时的自动化集成测试; 质量门为类型检查、贡献点与本地化一致性检查、
  单元测试与不依赖运行时的冒烟检查, 涉及真实 Extension Host 的行为由人工验收覆盖。
