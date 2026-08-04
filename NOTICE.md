# NOTICE

W3C Color Toolkit 是 MIT 许可的绿地实现。本文件记录需求来源与许可边界, 供代码审查追踪。

## 参考仓库

以下三个扩展只作为**功能需求、交互方式和兼容配置的证据来源**。检查日期 2026-08-04。

| 仓库 | 默认分支 | 检查提交 | 提交日期 | 许可 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `bbugh/vscode-change-color-format` | `master` | `83d47e4cc41fbef540e378ec44d286a6a244b2e2` | 2022-10-31 | MIT | 转换命令的交互与测试意图 |
| `iamsergii/vscode-ext-color-highlight` | `master` | `128639c9990a952ca85a257be1b5a2a8368ec589` | 2024-03-14 | GPL-3.0 | 仅公开的用户行为与配置键名 |
| `mattbierner/vscode-color-info` | `master` | `cf3b476920ec9bf3bee061c4901f352010afcc89` | 2023-01-17 | MIT | Hover 字段清单与配置键名 |

## 许可约束

- 本仓库**没有**从 `iamsergii/vscode-ext-color-highlight` 复制任何 GPL-3.0 源码、测试、图片或内部结构。
  该扩展的贡献仅限于: 公开可见的用户行为 (六种 marker 类型、overview ruler 标记、ARGB 解释、
  无函数 RGB/HSL 模式、颜色名开关) 与配置键名, 这些属于接口事实而非受版权保护的实现。
- 颜色内核为独立实现: 扫描基于 CSS token 与 component value 树, 与旧插件的正则策略在结构上不同;
  色彩转换由 Color.js 承担, 与旧插件使用的 `color@1.x` 无关。
- 如果将来决定直接复用任何 GPL-3.0 源码, 必须先停止开发, 重新确认整包许可证与分发义务。

## 运行时依赖

| 包 | 版本 | 许可 |
| --- | --- | --- |
| `@csstools/css-tokenizer` | 4.0.0 | MIT |
| `@csstools/css-parser-algorithms` | 4.0.0 | MIT |
| `@csstools/css-color-parser` | 4.1.10 | MIT |
| `colorjs.io` | 0.7.1 | MIT |

`src/core/keywords.named.ts` 中的 148 个命名颜色数值来自 CSS Color 4 规范本身 (规范文本不受
第三方版权限制), 生成时以 Color.js 的关键字表交叉核对。

## 规范基线

- CSS Color 4: Editor's Draft, 2026-07-28
- CSS Color 5: Editor's Draft, 2026-07-31
- CSS Color 6: Editor's Draft, 2026-01-11 (自述尚未准备实现)
- CSS Color HDR 1: Editor's Draft, 2026-07-28
