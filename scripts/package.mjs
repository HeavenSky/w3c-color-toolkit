/**
 * 打包 VSIX 到 `artifacts/`, 并检查包内容。
 *
 * 检查项 (对应验收标准 17):
 * - 必须包含 dist、l10n、两份 package.nls、LICENSE、NOTICE、README、CHANGELOG;
 * - 必须不包含 src、test、scripts、node_modules、参考仓库副本与 source map。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'artifacts');
mkdirSync(OUT_DIR, { recursive: true });

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const target = join(OUT_DIR, `${pkg.name}-${pkg.version}.vsix`);

const vsce = join(ROOT, 'node_modules', '.bin', 'vsce');

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

execFileSync(
  vsce,
  [
    'package',
    '--out',
    target,
    '--no-dependencies',
    '--skip-license',
    '--baseContentUrl',
    BASE,
    '--baseImagesUrl',
    BASE,
  ],
  { cwd: ROOT, stdio: 'inherit' },
);

const listing = execFileSync('unzip', ['-l', target], { encoding: 'utf8' });
const entries = listing
  .split('\n')
  .map((line) => line.trim().split(/\s+/).slice(3).join(' '))
  .filter((name) => name.startsWith('extension/'))
  .map((name) => name.slice('extension/'.length));

// 注意: vsce 会把 LICENSE / README.md / CHANGELOG.md 重命名为
// LICENSE.txt / readme.md / changelog.md, 因此这里按打包后的实际名字断言。
const required = [
  'dist/extension-node.js',
  'dist/extension-web.js',
  'l10n/bundle.l10n.json',
  'l10n/bundle.l10n.zh-cn.json',
  'package.nls.json',
  'package.nls.zh-cn.json',
  'package.json',
  'LICENSE.txt',
  'NOTICE.md',
  'readme.md',
  'README.zh-cn.md',
  'changelog.md',
  'media/icon.png',
];

// `required` 同时是允许清单: 包内容必须与它完全相等。
// 用允许清单而不是禁止清单 —— 禁止清单只能拦住预料到的路径,
// 任何新出现的生成目录 (如曾经泄漏的 `out-test/`) 都会静默通过。
const allowed = new Set(required);

const problems = [];
for (const name of required) {
  if (!entries.includes(name)) problems.push(`missing from VSIX: ${name}`);
}
for (const entry of entries) {
  if (!allowed.has(entry)) problems.push(`unexpected entry in VSIX: ${entry}`);
}

console.log(`\nVSIX entries (${entries.length}):`);
for (const entry of entries.sort()) console.log(`  ${entry}`);
console.log(`\nsize: ${(statSync(target).size / 1024).toFixed(0)} KB`);
console.log(`artifact: artifacts/${readdirSync(OUT_DIR).find((name) => name.endsWith('.vsix'))}`);

if (problems.length > 0) {
  console.error('\nVSIX content check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nVSIX content check passed');
