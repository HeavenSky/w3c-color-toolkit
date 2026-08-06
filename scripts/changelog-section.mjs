/**
 * 从 CHANGELOG.md 抽取指定版本的小节正文, 写到 stdout, 供 GitHub Release 说明使用。
 *
 * 用法: node scripts/changelog-section.mjs 0.0.1
 * 找不到该版本或正文为空时以退出码 1 结束, 由调用方决定回退方式。
 *
 * 标题格式统一为 `## v<版本> <日期> [标题]`, 标题可选:
 *
 *     ## v0.0.1 2026-08-04
 *     ## v0.0.2 2026-08-05 Port Toolkit
 *
 * 匹配时对 `v` 前缀, 方括号与 `-` 分隔符都保持宽容 (`## 0.0.1`、`## [0.0.1] - 2026-08-04`
 * 同样可被识别), 这样历史文件不会因为格式统一而突然抽不出正文; 新写的小节请用上面那一种。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('用法: node scripts/changelog-section.mjs <version>');
  process.exit(2);
}

const lines = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);

const isVersionHeading = (line) => /^##\s+v?\[?\d+\.\d+\.\d+/.test(line);
const matchesTarget = (line) => line.match(/^##\s+v?\[?(\d+\.\d+\.\d+[^\]\s]*)\]?/)?.[1] === version;

const start = lines.findIndex((line) => isVersionHeading(line) && matchesTarget(line));
if (start === -1) {
  console.error(`CHANGELOG.md 中没有版本 ${version} 的小节`);
  process.exit(1);
}

// 正文范围: 从标题下一行到下一个版本标题之前。
let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (isVersionHeading(lines[i])) {
    end = i;
    break;
  }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (body === '') {
  console.error(`版本 ${version} 的小节正文为空`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
