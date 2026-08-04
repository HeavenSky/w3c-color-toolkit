/**
 * 从 `src/l10n/strings.ts` 生成 `l10n/bundle.l10n.json` 与 `l10n/bundle.l10n.zh-cn.json`。
 *
 * 英语 bundle 直接使用默认文案 (等值映射), 中文 bundle 从 `scripts/l10n-zh-cn.mjs` 取值。
 * 两个 bundle 的 key 集合必须完全一致, 由 `--check` 与单元测试断言。
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

const en = {};
const zh = {};
for (const [key, text] of Object.entries(strings)) {
  // vscode.l10n 以默认文案作为 bundle 的 key。
  en[text] = text;
  const translated = ZH_CN_RUNTIME[key];
  if (translated === undefined) {
    errors.push(`missing Chinese runtime string: ${key}`);
    continue;
  }
  zh[text] = translated;
}
for (const key of Object.keys(ZH_CN_RUNTIME)) {
  if (!(key in strings)) errors.push(`unused Chinese runtime string: ${key}`);
}
if (Object.keys(en).length !== Object.keys(zh).length) {
  errors.push(`bundle key counts differ: en=${Object.keys(en).length} zh=${Object.keys(zh).length}`);
}
for (const [key, value] of Object.entries(zh)) {
  if (typeof value !== 'string' || value.length === 0) errors.push(`empty Chinese string for: ${key}`);
}

if (errors.length > 0) {
  console.error('gen-l10n failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const targets = [
  [join(ROOT, 'l10n/bundle.l10n.json'), `${JSON.stringify(en, null, 2)}\n`],
  [join(ROOT, 'l10n/bundle.l10n.zh-cn.json'), `${JSON.stringify(zh, null, 2)}\n`],
];

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
  console.log(`wrote l10n bundles: ${Object.keys(en).length} strings x 2 languages`);
}
