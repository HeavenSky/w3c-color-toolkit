// 功能截图的公共部分: 启动一个独立的 VS Code 实例(独立用户目录, 从本仓库直接加载扩展, 不碰日常使用的 VS Code), 经 CDP 操作窗口并截图.
// 由 scripts/shoot.mjs 调用, 各仓库的 scripts/shoot.mjs 只描述截图场景. 依赖 devDependencies 里的 playwright-core 与 sharp; README 用图取 TinyPNG 与 sharp 压缩结果中更小的.
// 只手动执行(npm run shots), 不接入打包与发布流程; 截图更新后连同 README 一起提交.
// 截图期间屏幕上会出现一个 VS Code 窗口, 不要操作它.
// 环境变量: VSCODE_APP VS Code 位置; SHOOT_PORT 调试端口; SHOOT_THEME 截图用的颜色主题; TINIFY_KEYS TinyPNG 的 key;
//          SHOOT_THEME_EXT 额外加载的主题扩展目录, 默认取同级目录下的 editor-comfort-theme(存在时).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// README 用图的最大宽度(像素); 原图是 2 倍屏截图, 缩到这个宽度后文字仍清晰
const README_WIDTH = 1600;
// 窗口内容区的固定尺寸(CSS 像素), 各次截图构图一致
const VIEW = { width: 1440, height: 900 };

/**
 * 缩到 width 宽后压缩: 先试 TinyPNG(环境变量 TINIFY_KEYS, 逗号分隔, 逐个尝试), 再用 sharp 做调色板量化, 取两者中更小的;
 * TinyPNG 未配置或失败时只用 sharp. 返回 { bytes, via }, via 为 'tinypng' 或 'sharp'.
 */
export async function compressPng(src, dest, width = README_WIDTH) {
	const resized = await sharp(src).resize({ width, withoutEnlargement: true }).png().toBuffer();
	const tiny = await tinify(resized);
	const local = await sharp(resized)
		.png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
		.toBuffer();
	const via = tiny && tiny.length < local.length ? "tinypng" : "sharp";
	const out = via === "tinypng" ? tiny : local;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, out);
	return { bytes: out.length, via };
}

async function tinify(buf) {
	const keys = (process.env.TINIFY_KEYS || "")
		.split(",")
		.map(k => k.trim())
		.filter(Boolean);
	for (const key of keys) {
		const auth = `Basic ${Buffer.from(`api:${key}`).toString("base64")}`;
		try {
			const res = await fetch("https://api.tinify.com/shrink", {
				method: "POST",
				headers: { Authorization: auth },
				body: buf,
				signal: AbortSignal.timeout(60000),
			});
			if (!res.ok) continue;
			const { output } = await res.json();
			const img = await fetch(output.url, {
				headers: { Authorization: auth },
				signal: AbortSignal.timeout(60000),
			});
			if (img.ok) return Buffer.from(await img.arrayBuffer());
		} catch {}
	}
	return null;
}

/**
 * 解析命令行: node scripts/shoot.mjs [输出目录] [--readme] [场景名过滤...]
 * 输出目录默认 artifacts/shots; --readme 时把截图另存一份缩小版到 media/screenshots/ 供 README 引用.
 */
export function parseArgs(repo) {
	const args = process.argv.slice(2);
	const readme = args.includes("--readme");
	const rest = args.filter(a => a !== "--readme");
	const out = path.resolve(
		rest[0] && !rest[0].startsWith("-") && rest[0].includes("/")
			? rest.shift()
			: path.join(repo, "artifacts/shots")
	);
	return { out, readme, only: rest };
}

/**
 * 启动 VS Code 并返回操作句柄.
 * @param {object} o
 * @param {string} o.repo 扩展仓库根目录
 * @param {string} o.id 短标识, 用于配置目录名(IPC socket 路径不能超过 103 字节, 所以要短)
 * @param {number} o.port 默认调试端口
 * @param {(ws: string) => void} [o.setup] 在工作区目录里准备文件
 * @param {object} [o.settings] 额外的用户设置
 * @param {string[]} [o.open] 启动时打开的文件(相对工作区)
 */
export async function launch(o) {
	const { out, readme, only } = parseArgs(o.repo);
	const app = process.env.VSCODE_APP || "/Applications/Visual Studio Code.app";
	const code = path.join(app, "Contents/MacOS/Code");
	const port = Number(process.env.SHOOT_PORT || o.port);
	// 配置目录, 工作区与扩展目录每次重建, 不残留上次的窗口布局; 工作区放在 ~/.cache 下, 截图里的路径短且不暴露仓库位置
	const root = path.join(os.homedir(), ".cache", `${o.id}-shoot`);
	fs.rmSync(root, { recursive: true, force: true });
	const profile = path.join(root, "p");
	const ws = path.join(root, "demo");
	const settingsFile = path.join(profile, "User", "settings.json");
	fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
	fs.mkdirSync(ws, { recursive: true });
	fs.mkdirSync(out, { recursive: true });
	o.setup?.(ws);

	const themeExt = process.env.SHOOT_THEME_EXT ?? path.join(o.repo, "..", "editor-comfort-theme");
	const hasThemeExt = themeExt && fs.existsSync(path.join(themeExt, "package.json"));
	const theme =
		process.env.SHOOT_THEME || (hasThemeExt ? "Comfort One Dark" : "Default Dark Modern");

	let current = {
		"workbench.startupEditor": "none",
		"workbench.tips.enabled": false,
		"telemetry.telemetryLevel": "off",
		"update.mode": "none",
		"security.workspace.trust.enabled": false,
		"extensions.ignoreRecommendations": true,
		"window.restoreWindows": "none",
		"git.openRepositoryInParentFolders": "never",
		"workbench.enableExperiments": false,
		"chat.commandCenter.enabled": false,
		"workbench.secondarySideBar.defaultVisibility": "hidden",
		"chat.disableAIFeatures": true,
		"editor.fontSize": 13,
		"window.zoomLevel": 0,
		"workbench.editor.enablePreview": false,
		"terminal.integrated.enablePersistentSessions": false,
		"workbench.layoutControl.enabled": false,
		"window.commandCenter": false,
		"editor.minimap.enabled": false,
		"editor.lightbulb.enabled": "off",
		"workbench.colorTheme": "Default Dark Modern",
		...o.settings,
	};
	// 改设置只写设置文件, VS Code 监听到后立即应用
	const writeSettings = () => fs.writeFileSync(settingsFile, JSON.stringify(current, null, 1));
	writeSettings();

	const extArgs = [`--extensionDevelopmentPath=${o.repo}`];
	if (hasThemeExt) extArgs.push(`--extensionDevelopmentPath=${path.resolve(themeExt)}`);
	const proc = spawn(
		code,
		[
			ws,
			"--user-data-dir",
			profile,
			"--extensions-dir",
			path.join(root, "ext"),
			...extArgs,
			`--remote-debugging-port=${port}`,
			"--disable-workspace-trust",
			"--skip-welcome",
			"--skip-release-notes",
			"--new-window",
			...(o.open ?? []).map(f => path.join(ws, f)),
		],
		{ stdio: "ignore" }
	);
	const kill = () => {
		try {
			proc.kill();
		} catch {}
	};
	process.on("exit", kill);

	let browser;
	for (let i = 0; i < 60 && !browser; i++) {
		await sleep(1000);
		try {
			browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
		} catch {}
	}
	if (!browser) {
		kill();
		throw new Error("连不上 VS Code 的调试端口");
	}
	let page;
	for (let i = 0; i < 60 && !page; i++) {
		for (const c of browser.contexts())
			for (const p of c.pages()) {
				if (
					!page &&
					(await p
						.locator(".monaco-workbench")
						.count()
						.catch(() => 0))
				)
					page = p;
			}
		if (!page) await sleep(1000);
	}
	if (!page) {
		kill();
		throw new Error("没找到工作台页面");
	}
	await page.waitForSelector(".monaco-workbench .part.editor", { timeout: 60000 });

	// 固定内容区大小: Electron 不支持 Browser.setWindowBounds, 改用设备尺寸模拟, 与实际窗口大小无关
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setDeviceMetricsOverride", {
		...VIEW,
		deviceScaleFactor: 2,
		mobile: false,
	});
	await sleep(5000);
	// 启动时扩展的主题还没注册, 设成它会被回退到默认主题; 等扩展加载完再切换
	current = { ...current, "workbench.colorTheme": theme };
	writeSettings();
	await sleep(2500);

	const mod = process.platform === "darwin" ? "Meta" : "Control";
	const press = async (keys, wait = 400) => {
		await page.keyboard.press(keys.replace(/\bMod\b/g, mod));
		await sleep(wait);
	};
	const type = async (text, wait = 400) => {
		await page.keyboard.type(text, { delay: 5 });
		await sleep(wait);
	};
	const quickInput = '.quick-input-widget:not([style*="display: none"])';

	const h = {
		page,
		ws,
		out,
		readme,
		mod,
		sleep,
		press,
		type,
		/** 是否要拍这个场景(命令行给了过滤词时只拍名字含过滤词的) */
		want: name => !only.length || only.some(w => name.includes(w)),
		/** 合并写入用户设置 */
		async settings(patch, wait = 1500) {
			current = { ...current, ...patch };
			writeSettings();
			await sleep(wait);
		},
		/** 在命令面板里按显示名执行命令 */
		async command(label, wait = 1200) {
			await press("Mod+Shift+P", 300);
			await page.waitForSelector(`${quickInput} input`, { timeout: 10000 });
			await page.keyboard.type(label, { delay: 5 });
			await sleep(700);
			await page.keyboard.press("Enter");
			await sleep(wait);
		},
		/** 只打开命令面板并输入, 不执行, 用来展示命令列表 */
		async palette(text, wait = 900) {
			await press("Mod+Shift+P", 300);
			await page.waitForSelector(`${quickInput} input`, { timeout: 10000 });
			await page.keyboard.type(text, { delay: 5 });
			await sleep(wait);
		},
		/** 在第 group 个编辑器组里用快速打开打开文件 */
		async openFile(file, group = 1) {
			await press(`Mod+${group}`);
			await press("Mod+P", 500);
			await type(file, 900);
			await press("Enter", 1200);
		},
		/** 把光标移到 行:列(从 1 开始) */
		async goto(line, col = 1) {
			await press("Control+G", 400);
			await type(`${line}:${col}`, 300);
			await press("Enter", 400);
		},
		/** 选中从 行:列 起的 n 个字符 */
		async select(line, col, n) {
			await h.goto(line, col);
			for (let i = 0; i < n; i++) await page.keyboard.press("Shift+ArrowRight");
			await sleep(300);
		},
		async escape(times = 1) {
			for (let i = 0; i < times; i++) await press("Escape", 250);
		},
		/** 关闭全部面板与弹层, 回到干净的编辑器状态 */
		async reset() {
			await h.escape(2);
			await h.command("View: Close All Editors", 800);
			await h.command("View: Close Panel", 500);
		},
		/**
		 * 截图到 <输出目录>/<name>.png; --readme 时另存压缩版到 media/screenshots/<name>.png.
		 * clip: 只截窗口的一部分(CSS 像素), 也可以传一个 locator, 取它的外框加 pad 留白; maxHeight 限制截取高度, 去掉下方空白.
		 * 截图前鼠标移到状态栏, 避免残留的悬停提示; 要拍悬停卡片时传 keepMouse: true.
		 */
		async shot(name, { clip, pad = 12, maxHeight = Infinity, keepMouse = false } = {}) {
			if (!keepMouse) {
				const vp0 = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
				await page.mouse.move(vp0.w / 2, vp0.h - 2);
			}
			await sleep(800);
			let region = clip;
			if (clip && typeof clip.boundingBox === "function") {
				const b = await clip.boundingBox();
				const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
				const x = Math.max(0, b.x - pad),
					y = Math.max(0, b.y - pad);
				region = {
					x,
					y,
					width: Math.min(vp.w - x, b.width + pad * 2),
					height: Math.min(vp.h - y, b.height + pad * 2),
				};
			}
			if (region && region.height > maxHeight) region = { ...region, height: maxHeight };
			const file = path.join(out, `${name}.png`);
			await page.screenshot({ path: file, ...(region ? { clip: region } : {}) });
			console.log("截图", name);
			if (readme) {
				const { bytes, via } = await compressPng(
					file,
					path.join(o.repo, "media/screenshots", `${name}.png`)
				);
				console.log(
					`  -> media/screenshots/${name}.png ${(bytes / 1024).toFixed(0)} KB (${via})`
				);
			}
			return file;
		},
		async close() {
			await browser.close().catch(() => {});
			kill();
		},
	};
	return h;
}

/** 在工作区里初始化一个 git 仓库并提交全部文件, 让文件树与源代码管理有正常的状态 */
export function gitInit(ws) {
	const git = (...a) =>
		spawnSync("git", ["-c", "user.name=demo", "-c", "user.email=demo@example.com", ...a], {
			cwd: ws,
		});
	git("init", "-q");
	git("add", "-A");
	git("commit", "-qm", "init");
	return git;
}
