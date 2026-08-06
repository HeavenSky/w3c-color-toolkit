/**
 * 用 esbuild 把扩展打成单文件 CJS bundle。
 *
 * 目标与入口全部从 `package.json` 推导, 因此本文件不需要随插件内容改动:
 * - 扩展宿主是 CJS, 所以必须 bundle 成 cjs 才能被 require;
 * - 声明了 `browser` 入口的插件按 browser platform 打包 —— 一旦有人 import 了 node
 *   内置模块, 构建会立即失败, 而不是留到 Web Extension Host 运行时才炸;
 * - `target` 对齐 `engines.vscode` 下限所搭载的 Node 版本。
 *
 * 用法: node build.mjs [--production] [--watch]
 */
import { readFileSync } from 'node:fs';

import * as esbuild from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const browser = Boolean(pkg.browser);
const outfile = pkg.main.replace(/^\.\//, '');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: browser ? 'browser' : 'node',
  target: browser ? 'es2022' : 'node22',
  external: ['vscode'],
  minify: production,
  sourcemap: production ? false : 'linked',
  legalComments: 'none',
  logLevel: 'info',
  ...(browser ? { define: { global: 'globalThis' } } : {}),
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log(`watching… → ${outfile}`);
} else {
  await esbuild.build(options);
}
