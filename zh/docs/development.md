# 开发

[English](../../docs/development.md) · **简体中文**

读完这页，你能从刚克隆的仓库打包出 `.vsix`；前提是安装了 `.nvmrc` 指定的 Node 版本。所有任务都列在 `package.json` 的 `scripts` 字段里。

## 构建与打包

```bash
npm ci
npm run check
npm run typecheck
npm run lint:check  # oxlint；`npm run lint` 会同时自动修复
npm run fmt:check  # oxfmt；`npm run fmt` 直接格式化
npm test
npm run package
```

`npm run check` 检查图标、清单、本地化与共享模板文件是否同步；`npm run package` 生成 `artifacts/<name>-<version>.vsix` 并断言包内容。

## 使用 npm 12 安装依赖

在 npm 12 下，`npm ci` 只接受从 `registry.npmjs.org` 解析的锁文件，依赖的安装脚本（`esbuild`、`@vscode/vsce-sign`、`fsevents`）默认跳过。检查、测试和打包都用不到它们。只有本地签名或发布失败时，才用 `npm install-scripts approve <package>` 放行对应的包；CI 使用 `.nvmrc` 对应 Node 版本自带的 npm，不受影响。

## 重新生成截图

`npm run shots` 在 macOS 上重新生成 `media/screenshots/` 下的图片，运行期间会打开一个 VS Code 窗口。截图不参与打包和发布，更新后与引用它的文档一起提交。
