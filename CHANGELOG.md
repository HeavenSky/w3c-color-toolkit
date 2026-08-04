# Changelog

本文件记录 W3C Color Toolkit 的显著变更。

## [未发布]

### 新增

- 行内色块与原生取色器: 注册 `DocumentColorProvider`, VS Code 因此会为本扩展支持的语法
  画行内色块并在 Hover 中提供原生取色器, 覆盖 `oklch()`、`lab()`、`color()`、`color-mix()`、
  相对颜色、HDR 空间, 以及注释与字符串里的颜色 —— 这些 VS Code 自带的提供器都不覆盖。
  范围与高亮共用同一份字段表; 上限按 `editor.colorDecoratorsLimit` (默认 500) 截断并记日志。
  由 `advanced.colorPicker.mode` 控制: `dedupe` (默认)、`all`、`off`;
  "启用功能"命令里也有对应开关。
  - `dedupe` 在 `css` / `less` / `scss` 里按文档版本探测一次其他颜色提供器, 只补它们没覆盖的
    range, 因此任何颜色都不会出现两个色块。必须探测的原因: VS Code 叠加渲染所有提供器的结果
    且不按 range 去重, 只要有扩展返回数组 (含空数组) 就不再使用内置默认提供器,
    而 `vscode.executeDocumentColorProvider` 不回传提供器身份。
  - 取色器写回时优先沿用原格式并跳过无法表达 alpha 的格式; 上下文相关值与只读语法
    (`color-mix()`、相对颜色、`contrast-color()`、`device-cmyk()`、`color-layers()`)
    只给只读色块, 不提供候选写法, 避免误拖把表达式压成字面值。
- 通过 `contributes.configurationDefaults` 把 `editor.defaultColorDecorators` 的默认值改为
  `never`: 内置默认提供器认的 hex 与 `rgb()`/`hsl()` 是本扩展上报范围的真子集,
  关掉它只去掉重叠, 不损失覆盖; 用户仍可改回 `auto` / `always`。
- 新增两种 marker 样式 `square-before` / `square-after`: 由本扩展自己的装饰画实心色块,
  不依赖 VS Code 的颜色功能 (原有的 `dot-before` / `dot-after` 仍是圆点)。

### 变更

- 高亮与 Hover 共用同一份字段表: `advanced.info.fields` / `advanced.info.excludedFields`
  改名为 `advanced.fields.enabled` / `advanced.fields.excluded`, 并同时决定
  "Hover 显示哪些行"与"高亮识别哪些颜色语法", 不再需要为高亮单独配置。
  命令 `w3cColorToolkit.configureInfoFields` (配置悬停字段) 改名为
  `w3cColorToolkit.configureColorFields` (配置颜色字段)。
- 字段表补齐到覆盖全部 41 种可扫描语法, 并按作用范围分组标注:
  CSS 格式 (Hover + 高亮)、只读 CSS 语法 (仅高亮, 如 `color-mix()`、相对颜色、
  `light-dark()`、系统色)、非 CSS 表示 (仅 Hover 的 `hsv`/`cmyk`)、
  以及不构成完整颜色的附加信息 (仅 Hover 的预览、原始语法、alpha、色域、对比度、
  规范层级、解析说明)。注册表未登记的语法一律放行, 解析器新增语法不会静默失去高亮。
- 新增 Hover 字段 `color-srgb`、`color-srgb-linear`、`color-display-p3-linear`,
  使 Hover 字段覆盖全部 24 个转换目标格式。
- `advanced.contextualPreview` 新增 `auto` 并改为默认值: 跟随编辑器当前主题选择
  `light-dark()` 的分支, 因此 `light-dark()` 默认就有预览色与高亮; 结果在 Hover 中
  仍标注为假设值, 切换主题会重新扫描。设为 `off` 可回到旧行为。
- "配置颜色字段"勾选一个此前被 `fields.excluded` 排除的字段时, 会同时解除排除;
  HDR 开关关闭时不再因为勾选列表里没有 HDR 字段而把它们从配置中丢掉。

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
