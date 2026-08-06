/**
 * 发布前的一致性门禁。
 *
 * 本文件只做与插件内容无关的通用检查; 本插件专属的规则放在可选的 `scripts/check-extra.mjs`。
 *
 * 检查项:
 * 1. 图标产物与 `scripts/icon-spec.mjs` 一致;
 * 2. package.nls 中英 key 集一致, 且与清单占位符一一对应;
 * 3. l10n bundle 之间 key 集一致;
 * 4. src 内联的 l10n.t 字面量与中文 bundle 一一对应;
 * 5. `.template-shared` 存在时, A 类骨架文件未偏离骨架;
 * 6. `scripts/check-extra.mjs` 存在时执行它导出的 `checks(root)`。
 *
 * 用法: node scripts/check.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkInlineRuntimeStrings,
  checkL10nBundleParity,
  checkNlsParity,
} from './lib/check-manifest.mjs';
import { MANIFEST_NAME, checkShared } from './lib/template-shared.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const problems = [];
const run = (label, fn) => {
  try {
    const found = fn();
    problems.push(...found);
    if (found.length === 0) console.log(`  ok  ${label}`);
    else console.log(`fail  ${label}`);
  } catch (error) {
    problems.push(`${label} 执行失败: ${error.message}`);
    console.log(`fail  ${label}`);
  }
};

console.log('checks:');

run('icon 产物与 spec 一致', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/gen-icon.mjs'), '--check'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  return [];
});
run('package.nls 与清单占位符一致', () => checkNlsParity(ROOT));
run('l10n bundle key 集一致', () => checkL10nBundleParity(ROOT));
run('内联运行时文案与中文 bundle 一致', () => checkInlineRuntimeStrings(ROOT));

// 没有清单就跳过: 允许不关心骨架一致性的仓库删掉那份文件。
const manifestPath = join(ROOT, MANIFEST_NAME);
if (existsSync(manifestPath)) {
  run('A 类文件未偏离骨架', () =>
    checkShared({
      manifestText: readFileSync(manifestPath, 'utf8'),
      readFile: (path) => {
        const full = join(ROOT, path);
        return existsSync(full) ? readFileSync(full) : undefined;
      },
    }),
  );
}

const extraPath = join(ROOT, 'scripts/check-extra.mjs');
if (existsSync(extraPath)) {
  const extra = await import(extraPath);
  for (const [label, fn] of Object.entries(extra.checks(ROOT))) run(label, fn);
}

if (problems.length > 0) {
  console.error('\ncheck failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nall checks passed');
