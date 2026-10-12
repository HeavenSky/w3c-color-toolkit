/**
 * 用 esbuild 把扩展打成单文件 CJS bundle。
 *
 * 目标与入口全部从 `package.json` 推导, 因此本文件不需要随插件内容改动:
 * - 扩展宿主是 CJS, 所以必须 bundle 成 cjs 才能被 require;
 * - 声明了 `browser` 入口的插件按 browser platform 打包 —— 一旦有人 import 了 node
 *   内置模块, 构建会立即失败, 而不是留到 Web Extension Host 运行时才炸;
 * - `target` 对齐 `engines.vscode` 下限所搭载的 Node 版本。
 *
 * 没有 `main` 的扩展 (纯主题, 图标主题这类无运行时代码的形态) 直接跳过构建并成功退出, 因此
 * `vscode:prepublish` 与调试任务照常可用; esbuild 也只在真正构建时才加载, 这类仓库不必安装它。
 *
 * 用法: node build.mjs [--production] [--watch]
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

if (!pkg.main) {
	console.log("package.json 没有 main: 无运行时代码, 跳过构建");
	process.exit(0);
}

const esbuild = await import("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const browser = Boolean(pkg.browser);
const outfile = pkg.main.replace(/^\.\//, "");

/** @type {import('esbuild').BuildOptions} */
const options = {
	entryPoints: ["src/extension.ts"],
	outfile,
	bundle: true,
	format: "cjs",
	platform: browser ? "browser" : "node",
	target: browser ? "es2022" : "node22",
	external: ["vscode"],
	minify: production,
	sourcemap: production ? false : "linked",
	legalComments: "none",
	logLevel: "info",
	...browser ? { define: { global: "globalThis" } } : {},
};

if (watch) {
	const context = await esbuild.context(options);
	await context.watch();
	console.log(`watching… → ${outfile}`);
} else {
	await esbuild.build(options);
}