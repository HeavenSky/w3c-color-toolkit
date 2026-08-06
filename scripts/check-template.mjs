/**
 * 骨架漂移检查的 CLI。
 *
 * 用法:
 *   node scripts/check-template.mjs            核对 A 类文件, 有偏离则退出码 1
 *   node scripts/check-template.mjs --update    按当前内容重写 hash (只在骨架仓库里用)
 *
 * 没有 `.template-shared` 时直接跳过: 允许不关心骨架一致性的仓库删掉那份清单。
 * 规则与理由见 `scripts/lib/template-shared.mjs`。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANIFEST_NAME,
  checkShared,
  parseManifest,
  renderManifest,
} from './lib/template-shared.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const manifestPath = join(ROOT, MANIFEST_NAME);

if (!existsSync(manifestPath)) {
  console.log(`${MANIFEST_NAME} 不存在, 跳过骨架漂移检查`);
  process.exit(0);
}

const manifestText = readFileSync(manifestPath, 'utf8');
const readFile = (path) => {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full) : undefined;
};

if (process.argv.includes('--update')) {
  const entries = parseManifest(manifestText);
  const missing = entries.filter((entry) => readFile(entry.path) === undefined);
  if (missing.length > 0) {
    console.error('无法更新, 以下文件不存在:');
    for (const entry of missing) console.error(`  - ${entry.path}`);
    process.exit(1);
  }
  writeFileSync(manifestPath, renderManifest(manifestText, entries, (path) => readFile(path)));
  console.log(`${MANIFEST_NAME} 已按当前内容重写 (${entries.length} 个文件)`);
  process.exit(0);
}

const problems = checkShared({ manifestText, readFile });
if (problems.length > 0) {
  console.error('骨架漂移检查失败:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`骨架漂移检查通过 (${parseManifest(manifestText).length} 个文件)`);
