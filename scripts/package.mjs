/**
 * 打包 VSIX 到 `artifacts/`, 并断言包内容。
 *
 * **进包的是什么**由 `package.json` 的 `files` 白名单决定, 不用 `.vscodeignore` —— vsce 只支持
 * 其中一种, 两者并存时它会直接失败。白名单选的是允许清单而不是禁止清单: 禁止清单只能拦住
 * 预料到的路径, 任何新出现的生成目录都会静默混进包里。
 *
 * **应该进包的是什么**则完全从 `package.json` 的清单字段与仓库里实际存在的文档文件推导,
 * 因此本文件不需要随插件内容改动。推导规则在 `scripts/lib/vsix-allowlist.mjs` 里, 是纯函数且有单测。
 *
 * 这两条路径互相独立 —— 一边是手写的 `files`, 一边是从 `contributes` 推导的期望集合 —— 所以
 * 加了贡献点却忘记加进 `files`, 或 `files` 里留着已经删掉的条目, 都会在下面的断言里暴露。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import deriveAllowlist from "./lib/vsix-allowlist.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT_DIR = join(ROOT, "artifacts");

// execFileSync 默认不设超时, 子进程卡住会让打包永远挂着而不是失败退出 —— 在 CI 上表现为
// job 跑到 runner 超时, 看不出卡在哪一步。vsce 要压缩整个包并访问 marketplace 元数据, 取宽值;
// unzip 只读本地已经落盘的 vsix, 短值足够。
const VSCE_TIMEOUT_MS = 10 * 60_000;
const UNZIP_TIMEOUT_MS = 60_000;

/**
 * 跑一个子进程, 失败时连同它的输出一起报出来再退出。
 *
 * 原来这两处调用都没有 catch: 子进程一失败就是一段带 Node 栈的未捕获异常, 看不出是哪一步挂的。
 * execFileSync 只会把 stderr 拼进 error.message, 所以这里补 stdout 并按 message 已有内容去重;
 * stdio: "inherit" 的调用两个字段都是 null, 输出早已直接落到终端, 只剩一行失败标签。
 */
function runChild(label, args, options) {
	try {
		return execFileSync(args[0], args.slice(1), options);
	} catch (error) {
		const detail = [error.stderr, error.stdout]
			.map(chunk => chunk ? chunk.toString().trim() : "")
			.filter(chunk => chunk && !error.message.includes(chunk))
			.join("\n");
		console.error(`\n${label} 失败: ${error.message}${detail ? `\n${detail}` : ""}`);
		process.exit(1);
	}
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const target = join(OUT_DIR, `${pkg.name}-${pkg.version}.vsix`);

// NEVER 显式传 --baseContentUrl / --baseImagesUrl: vsce 会从 package.json 的 repository
// 自动推导出正确的一对基址 (链接 `/blob/HEAD`, 图片 `/raw/HEAD`), 而显式传参会抹掉这个区分 ——
// 只传 baseContentUrl 时 baseImagesUrl 也会回退到它, 结果文档链接指向 raw 纯文本。
// 这里仍校验 repository, 让地址不合规时立刻失败, 而不是等 vsce 遇到相对链接才报错。
const repoUrl = (pkg.repository?.url ?? pkg.repository ?? "")
	.replace(/^git\+/, "")
	.replace(/\.git$/, "");
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
	console.error(`package.json 的 repository.url 不是预期的 GitHub 地址: ${repoUrl || "(空)"}`);
	process.exit(1);
}

// 打包策略走 `files` 白名单。这两条本来也会失败 —— 前者被 vsce 拒绝, 后者会让整个工作目录
// 进包并撞上下面的内容断言 —— 但那时的报错离原因很远, 所以在这里先拦一道并说清该怎么做。
if (existsSync(join(ROOT, ".vscodeignore"))) {
	console.error(".vscodeignore 与 package.json 的 files 不能并存, vsce 只支持其一; 本骨架用 files, 删掉 .vscodeignore");
	process.exit(1);
}
if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
	console.error("package.json 缺少 files 白名单; 没有它 vsce 会把整个工作目录打进 VSIX");
	process.exit(1);
}

/** 递归列出目录下的文件, 返回相对该目录的路径。 */
function listFiles(dir, prefix = "") {
	const found = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) found.push(...listFiles(join(dir, entry.name), relative));
		else found.push(relative);
	}
	return found;
}

// ── 打包 ────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const vsce = join(ROOT, "node_modules", ".bin", "vsce");

runChild(
	"vsce package",
	[
		vsce,
		"package",
		"--out",
		target,
		// 产物由 esbuild 打成单文件, 不需要 vsce 解析并打包依赖树。
		"--no-dependencies",
	],
	{ cwd: ROOT, stdio: "inherit", timeout: VSCE_TIMEOUT_MS }
);

// ── 推导允许清单 ────────────────────────────────────────────
// 必须放在 vsce package 之后: 它先跑 `vscode:prepublish` 构建, `.wasm` 与捆绑的第三方语言包
// 这类构建期产物此时才落盘; 提前推导会在全新 clone 的首次打包里把它们判成 unexpected entry。
// l10n 要递归读: 捆绑第三方语言服务器时, 它自带的语言包按来源放在各自的子目录里。
// 纯主题扩展没有 `main`, 也就没有入口目录可读。
const outDir = pkg.main ? join(ROOT, pkg.main.replace(/^\.\//, "").split("/").slice(0, -1).join("/")) : undefined;
const allowed = deriveAllowlist({
	pkg,
	rootEntries: readdirSync(ROOT),
	l10nEntries: pkg.l10n ? listFiles(join(ROOT, pkg.l10n.replace(/^\.\//, ""))) : [],
	outEntries: outDir && existsSync(outDir) ? readdirSync(outDir) : [],
});

// ── 断言包内容 ──────────────────────────────────────────────
const listing = runChild("unzip -l", ["unzip", "-l", target], {
	encoding: "utf8",
	timeout: UNZIP_TIMEOUT_MS,
});
const entries = listing
	.split("\n")
	.map(line => line.trim().split(/\s+/).slice(3).join(" "))
	.filter(name => name.startsWith("extension/"))
	.map(name => name.slice("extension/".length));

const problems = [];
for (const name of allowed) {
	if (!entries.includes(name)) problems.push(`missing from VSIX: ${name}`);
}
for (const entry of entries) {
	if (!allowed.has(entry)) problems.push(`unexpected entry in VSIX: ${entry}`);
}

console.log(`\nVSIX entries (${entries.length}):`);
for (const entry of [...entries].sort()) console.log(`  ${entry}`);
console.log(`\nsize: ${(statSync(target).size / 1024).toFixed(0)} KB`);
console.log(`artifact: artifacts/${pkg.name}-${pkg.version}.vsix`);

if (problems.length > 0) {
	console.error("\nVSIX content check failed:");
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}
console.log("\nVSIX content check passed");