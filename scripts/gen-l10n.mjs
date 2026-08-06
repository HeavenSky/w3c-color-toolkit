/**
 * 从 `src/l10n/strings.ts` 生成 `l10n/bundle.l10n.zh-cn.json`。
 *
 * `vscode.l10n.t` 用默认文案本身作为 bundle 的 key, 所以英语 bundle 只会是恒等映射,
 * 缺失时 VS Code 直接回退到源码里的默认文案 —— 因此不生成英语 bundle。
 * 中文译文从 `scripts/l10n-zh-cn.mjs` 取值, 与 key 集必须一一对应, 由 `--check` 断言。
 */
import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ZH_CN_RUNTIME } from './l10n-zh-cn.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CHECK_ONLY = process.argv.includes('--check');

async function loadStrings() {
  const dir = await mkdtemp(join(tmpdir(), 'w3c-color-toolkit-l10n-'));
  const outfile = join(dir, 'strings.mjs');
  await build({
    entryPoints: [join(ROOT, 'scripts/strings-entry.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['vscode'],
    logLevel: 'silent',
  });
  try {
    return (await import(pathToFileURL(outfile).href)).RUNTIME_STRINGS;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const strings = await loadStrings();
const errors = [];

const zh = {};
/** text → 首个使用它的 key, 用于报告"同文案不同译文"的冲突。 */
const owner = new Map();
for (const [key, text] of Object.entries(strings)) {
  // vscode.l10n 以默认文案作为 bundle 的 key, 因此英语 bundle 会是恒等映射:
  // 缺失时 VS Code 直接使用源码里的默认文案, 结果完全相同, 所以不生成英语 bundle。
  const translated = ZH_CN_RUNTIME[key];
  if (translated === undefined) {
    errors.push(`missing Chinese runtime string: ${key}`);
    continue;
  }
  // 多个 key 共用同一默认文案是允许的 (bundle 会合并成一条), 但译文必须相同 ——
  // 否则 l10n 无法区分它们, 最终显示哪一条取决于遍历顺序。
  const previous = owner.get(text);
  if (previous !== undefined && zh[text] !== translated) {
    errors.push(
      `conflicting Chinese strings for the same default text ${JSON.stringify(text)}: ` +
        `${previous}="${zh[text]}" vs ${key}="${translated}"`,
    );
    continue;
  }
  owner.set(text, previous ?? key);
  zh[text] = translated;
}
for (const key of Object.keys(ZH_CN_RUNTIME)) {
  if (!(key in strings)) errors.push(`unused Chinese runtime string: ${key}`);
}
const distinctTexts = new Set(Object.values(strings)).size;
if (Object.keys(zh).length !== distinctTexts) {
  errors.push(`bundle key count mismatch: distinct texts=${distinctTexts} zh=${Object.keys(zh).length}`);
}
for (const [key, value] of Object.entries(zh)) {
  if (typeof value !== 'string' || value.length === 0) errors.push(`empty Chinese string for: ${key}`);
}

if (errors.length > 0) {
  console.error('gen-l10n failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const targets = [[join(ROOT, 'l10n/bundle.l10n.zh-cn.json'), `${JSON.stringify(zh, null, 2)}\n`]];

if (CHECK_ONLY) {
  let drifted = false;
  for (const [path, expected] of targets) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected) {
      console.error(`out of date: ${path}`);
      drifted = true;
    }
  }
  if (drifted) {
    console.error('run `npm run gen:l10n` to regenerate');
    process.exit(1);
  }
  console.log('l10n bundles are up to date');
} else {
  for (const [path, content] of targets) await writeFile(path, content, 'utf8');
  console.log(`wrote l10n/bundle.l10n.zh-cn.json: ${Object.keys(zh).length} strings`);
}
