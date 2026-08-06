/**
 * 生成 `media/icon.svg` 与 `media/icon.png`。
 *
 * 图形定义在 `scripts/icon-spec.mjs`, 底座参数在 `scripts/lib/icon-brand.mjs`,
 * 渲染实现在 `scripts/lib/icon-render.mjs`。
 *
 * 用法:
 *   node scripts/gen-icon.mjs           写入
 *   node scripts/gen-icon.mjs --check    只校验产物是否与 spec 一致, 不写入 (供 CI 使用)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPng, renderSvg } from './lib/icon-render.mjs';
import { spec } from './icon-spec.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const targets = [
  { path: join(ROOT, 'media/icon.svg'), content: Buffer.from(renderSvg(spec), 'utf8') },
  { path: join(ROOT, 'media/icon.png'), content: renderPng(spec) },
];

if (CHECK_ONLY) {
  const stale = [];
  for (const target of targets) {
    let current = null;
    try {
      current = readFileSync(target.path);
    } catch {
      stale.push(`${target.path} 不存在`);
      continue;
    }
    if (!current.equals(target.content)) stale.push(`${target.path} 与 icon-spec.mjs 不一致`);
  }
  if (stale.length > 0) {
    console.error('图标产物已过期, 请运行 npm run gen:icon:');
    for (const item of stale) console.error(`  - ${item}`);
    process.exit(1);
  }
  console.log('icon ok: media/icon.svg 与 media/icon.png 与 spec 一致');
} else {
  mkdirSync(join(ROOT, 'media'), { recursive: true });
  for (const target of targets) {
    writeFileSync(target.path, target.content);
    console.log(`wrote ${target.path.slice(ROOT.length)} — ${(target.content.length / 1024).toFixed(1)} KB`);
  }
}
