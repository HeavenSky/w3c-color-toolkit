/**
 * `.template-shared` 的解析与核对: A 类骨架文件是否仍与骨架一致。
 *
 * 为什么需要机制而不是约定: "复制后不要改"没有任何东西保证 —— 改了不会报错, 只会让这个
 * 仓库悄悄脱离骨架, 等骨架升级时无法整份覆盖, 而偏离是什么时候引入的已经查不到了。
 * 把 hash 记进 `.template-shared`, 偏离就变成可检测项。
 *
 * 逃生口是删行而不是改文件: 某个仓库确实需要长期偏离时, 从 `.template-shared` 删掉那一行
 * 并在注释里写明原因。显式退出共享比悄悄改掉一个声称"不要改"的文件好。
 *
 * 本模块是纯函数: 文件内容由调用方读好传进来, 便于单测用假清单断言解析与核对规则。
 */
import { createHash } from 'node:crypto';

export const MANIFEST_NAME = '.template-shared';

export const MANIFEST_HEADER = [
  '# vsc-ext 骨架的 A 类共享文件: 与插件内容无关, 复制后不要改动。',
  '# 每行是 <sha256 前 16 位> + 两个空格 + 相对路径。`#` 开头为注释。',
  '# 核对: node scripts/check-template.mjs (npm run check 也会跑)',
  '# 骨架仓库改了共享文件后: node scripts/check-template.mjs --update',
  '# 本仓库需要长期偏离某个文件时: 删掉那一行, 并在此写明原因。',
];

/** 记录用的短 hash: 16 个十六进制字符, 碰撞概率对这个用途足够低, 且一行读得完。 */
export function digest(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 解析清单。
 *
 * 兼容只有路径, 没有 hash 的旧格式行: 那种行无法核对内容, 只核对文件是否存在,
 * 并提示跑 `--update` 补齐。
 *
 * @param {string} text
 * @returns {{ hash: string | null, path: string }[]}
 */
export function parseManifest(text) {
  const entries = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^([0-9a-f]{16})\s+(.+)$/.exec(line);
    if (match) entries.push({ hash: match[1], path: match[2].trim() });
    else entries.push({ hash: null, path: line });
  }
  return entries;
}

/**
 * 按当前文件内容重写清单, 保留原有的注释行 (逃生口的原因说明写在注释里, 不能被 --update 抹掉)。
 *
 * @param {string} previousText 现有清单内容; 首次生成传空串
 * @param {{ hash: string | null, path: string }[]} entries 目标条目, 顺序即输出顺序
 * @param {(path: string) => string | Buffer} readFile
 * @returns {string}
 */
export function renderManifest(previousText, entries, readFile) {
  const comments = previousText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('#') && !MANIFEST_HEADER.includes(line));

  const lines = [...MANIFEST_HEADER, ...comments, ''];
  for (const entry of entries) lines.push(`${digest(readFile(entry.path))}  ${entry.path}`);
  return `${lines.join('\n')}\n`;
}

/**
 * 核对清单里的每个文件。
 *
 * @param {object} input
 * @param {string} input.manifestText
 * @param {(path: string) => string | Buffer | undefined} input.readFile 读不到时返回 undefined
 * @returns {string[]} 问题描述; 空数组表示通过
 */
export function checkShared({ manifestText, readFile }) {
  const problems = [];
  for (const entry of parseManifest(manifestText)) {
    const content = readFile(entry.path);
    if (content === undefined) {
      problems.push(`${entry.path}: 清单里有但文件不存在`);
      continue;
    }
    if (entry.hash === null) {
      problems.push(`${entry.path}: 清单里没有记录 hash, 跑 check-template.mjs --update 补齐`);
      continue;
    }
    const actual = digest(content);
    if (actual !== entry.hash) {
      problems.push(
        `${entry.path}: 已偏离骨架 (清单 ${entry.hash}, 实际 ${actual}) —— ` +
          '确实要长期偏离就从 .template-shared 删掉这一行并写明原因',
      );
    }
  }
  return problems;
}
