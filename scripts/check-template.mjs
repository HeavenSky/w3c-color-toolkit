/**
 * 骨架漂移检查的 CLI。
 *
 * 用法:
 *   node scripts/check-template.mjs            核对 A 类文件, 有偏离则退出码 1
 *   node scripts/check-template.mjs --update   按 SHARED_FILES 重写基线 (只在骨架仓库里用)
 *
 * `--update` 有门控: 在派生仓库执行它会把本地偏离固化成新基线, 检查从此永远通过且无人察觉。
 * 判据见 `lib/template-shared.mjs` 的 `isSkeletonRepo`。
 *
 * 没有 `.template-shared` 时直接跳过: 允许不关心骨架一致性的仓库删掉那份清单。
 * 规则与理由见 `scripts/lib/template-shared.mjs`。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANIFEST_NAME,
  MARKER_NAME,
  SHARED_FILES,
  checkShared,
  isSkeletonRepo,
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

/** 读 `package.json` 的 `name`; 读不到时返回 undefined, 门控会因此判定为非骨架。 */
function readPackageName() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name;
  } catch {
    return undefined;
  }
}

if (process.argv.includes('--update')) {
  if (!isSkeletonRepo({ hasMarker: existsSync(join(ROOT, MARKER_NAME)), packageName: readPackageName() })) {
    console.error('--update 只能在骨架仓库里执行, 本仓库不是骨架。');
    console.error('');
    console.error(`  判据: 根目录存在 ${MARKER_NAME}, 且 package.json 的 name 仍是未替换的占位符。`);
    console.error('  在派生仓库重写基线会把本地偏离固化成"正确", 漂移检查从此永远通过。');
    console.error('');
    console.error(`  想同步骨架: 从骨架复制 A 类文件与 ${MANIFEST_NAME}。`);
    console.error(`  想长期偏离某个文件: 在 ${MANIFEST_NAME} 里把那一行改成 !<路径>  <原因>。`);
    process.exit(1);
  }

  const { excluded } = parseManifest(manifestText);
  const excludedPaths = new Set(excluded.map((entry) => entry.path));

  const missing = SHARED_FILES.filter(
    (path) => !excludedPaths.has(path) && readFile(path) === undefined,
  );
  if (missing.length > 0) {
    console.error('无法更新, 以下 A 类文件不存在:');
    for (const path of missing) console.error(`  - ${path}`);
    process.exit(1);
  }

  writeFileSync(manifestPath, renderManifest({ excluded, readFile }));

  const tracked = SHARED_FILES.length - excluded.length;
  const suffix = excluded.length > 0 ? `, ${excluded.length} 个已声明退出共享` : '';
  console.log(`${MANIFEST_NAME} 已重新生成 (${tracked} 个文件${suffix})`);
  process.exit(0);
}

const problems = checkShared({ manifestText, readFile });
if (problems.length > 0) {
  console.error('骨架漂移检查失败:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const { tracked, excluded } = parseManifest(manifestText);
const suffix = excluded.length > 0 ? `, ${excluded.length} 个已声明退出共享` : '';
console.log(`骨架漂移检查通过 (${tracked.length} 个文件${suffix})`);
