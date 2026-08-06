/**
 * 打包 VSIX 到 `artifacts/`, 并断言包内容。
 *
 * 期望的包内容完全从 `package.json` 与仓库里实际存在的文档文件推导, 因此本文件不需要
 * 随插件内容改动。推导规则本身在 `scripts/lib/vsix-allowlist.mjs` 里, 是纯函数且有单测。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveAllowlist } from './lib/vsix-allowlist.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'artifacts');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const target = join(OUT_DIR, `${pkg.name}-${pkg.version}.vsix`);

// NEVER 显式传 --baseContentUrl / --baseImagesUrl: vsce 会从 package.json 的 repository
// 自动推导出正确的一对基址 (链接 `/blob/HEAD`, 图片 `/raw/HEAD`), 而显式传参会抹掉这个区分 ——
// 只传 baseContentUrl 时 baseImagesUrl 也会回退到它, 结果文档链接指向 raw 纯文本。
// 这里仍校验 repository, 让地址不合规时立刻失败, 而不是等 vsce 遇到相对链接才报错。
const repoUrl = (pkg.repository?.url ?? pkg.repository ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
  console.error(`package.json 的 repository.url 不是预期的 GitHub 地址: ${repoUrl || '(空)'}`);
  process.exit(1);
}

/** 递归列出目录下的文件, 返回相对该目录的路径。 */
function listFiles(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(join(dir, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

// ── 推导允许清单 ────────────────────────────────────────────
// 入口所在目录要在构建之后读: `.wasm` 这类无法内联的产物是构建阶段才落盘的。
// l10n 要递归读: 捆绑第三方语言服务器时, 它自带的语言包按来源放在各自的子目录里。
const outDir = join(ROOT, pkg.main.replace(/^\.\//, '').split('/').slice(0, -1).join('/'));
const allowed = deriveAllowlist({
  pkg,
  rootEntries: readdirSync(ROOT),
  l10nEntries: pkg.l10n ? listFiles(join(ROOT, pkg.l10n.replace(/^\.\//, ''))) : [],
  outEntries: existsSync(outDir) ? readdirSync(outDir) : [],
});

// ── 打包 ────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const vsce = join(ROOT, 'node_modules', '.bin', 'vsce');

execFileSync(
  vsce,
  [
    'package',
    '--out',
    target,
    // 产物由 esbuild 打成单文件, 不需要 vsce 解析并打包依赖树。
    '--no-dependencies',
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

// ── 断言包内容 ──────────────────────────────────────────────
const listing = execFileSync('unzip', ['-l', target], { encoding: 'utf8' });
const entries = listing
  .split('\n')
  .map((line) => line.trim().split(/\s+/).slice(3).join(' '))
  .filter((name) => name.startsWith('extension/'))
  .map((name) => name.slice('extension/'.length));

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
  console.error('\nVSIX content check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nVSIX content check passed');
