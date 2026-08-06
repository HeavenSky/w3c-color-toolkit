/**
 * 打包 VSIX 到 `artifacts/`, 并断言包内容。
 *
 * 期望的包内容完全从 `package.json` 与仓库里实际存在的文档文件推导, 因此本文件不需要
 * 随插件内容改动。用**允许清单**而不是禁止清单: 禁止清单只能拦住预料到的路径, 任何
 * 新出现的生成目录都会静默混进包里。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'artifacts');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const target = join(OUT_DIR, `${pkg.name}-${pkg.version}.vsix`);

// vsce 需要 baseContentUrl/baseImagesUrl 才能把 README 里的相对链接改写成绝对地址。
// 从 package.json 的 repository 推导, 避免仓库地址在两处各写一遍。
const repoUrl = (pkg.repository?.url ?? pkg.repository ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
  console.error(`package.json 的 repository.url 不是预期的 GitHub 地址: ${repoUrl || '(空)'}`);
  process.exit(1);
}
const BASE = `${repoUrl}/raw/HEAD/`;

// ── 推导允许清单 ────────────────────────────────────────────
const strip = (path) => path.replace(/^\.\//, '');
const allowed = new Set(['package.json']);

allowed.add(strip(pkg.main));
if (pkg.browser) allowed.add(strip(pkg.browser));
if (pkg.icon) allowed.add(strip(pkg.icon));

if (pkg.l10n) {
  const dir = strip(pkg.l10n);
  for (const name of readdirSync(join(ROOT, dir))) allowed.add(`${dir}/${name}`);
}

for (const name of ['package.nls.json', 'package.nls.zh-cn.json']) {
  if (existsSync(join(ROOT, name))) allowed.add(name);
}

// vsce 会把这几个文档重命名后再放进包里, 因此按打包后的实际名字断言。
const RENAMED = { 'README.md': 'readme.md', 'CHANGELOG.md': 'changelog.md' };
for (const name of ['LICENSE.txt', 'NOTICE.md', 'README.md', 'CHANGELOG.md']) {
  if (existsSync(join(ROOT, name))) allowed.add(RENAMED[name] ?? name);
}
// README 的其它语言版本保留原名, 例如 README.zh-cn.md。
for (const name of readdirSync(ROOT)) {
  if (/^README\..+\.md$/.test(name) && name !== 'README.md') allowed.add(name);
}

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
    '--baseContentUrl',
    BASE,
    '--baseImagesUrl',
    BASE,
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
