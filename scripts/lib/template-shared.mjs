/**
 * `.template-shared` 的生成与核对: A 类骨架文件是否仍与骨架一致。
 *
 * 为什么需要机制而不是约定: "复制后不要改"没有任何东西保证 —— 改了不会报错, 只会让这个
 * 仓库悄悄脱离骨架, 等骨架升级时无法整份覆盖, 而偏离是什么时候引入的已经查不到了。
 * 把 hash 记进 `.template-shared`, 偏离就变成可检测项。
 *
 * ── 三条设计约束 ──────────────────────────────────────────
 *
 * **文件列表在 `SHARED_FILES`, 不在清单里。** 清单只是 hash 基线, 是纯生成物 —— 骨架维护者
 * 增删 A 类文件时只改这个数组, 跑一次 `--update` 即可, 不需要编辑清单。这也意味着清单被清空
 * 或改残后能被完整重建, 而不是只能从别的仓库反抄路径。
 *
 * **偏离用 `!` 行声明, 不是删行。** 某个仓库确实需要长期偏离时, 在清单里写
 * `!<路径>  <原因>`。删行的老办法在列表进脚本后已经失效 —— 删掉的行会在下次 `--update` 时
 * 重新长回来。原因与排除项写在同一行, 生成时整行保留。
 *
 * **`--update` 只在骨架仓库可用。** 在派生仓库跑它会把本地偏离固化成新基线, 检查从此永远
 * 通过且无人察觉 —— 这比"忘了同步"严重得多。门控见 `isSkeletonRepo`。
 *
 * 本模块是纯函数: 文件内容由调用方读好传进来, 便于单测用假清单断言解析与核对规则。
 */
import { createHash } from 'node:crypto';

export const MANIFEST_NAME = '.template-shared';

/** 骨架身份标记; 派生仓库落地时应删除, 见 `isSkeletonRepo`。 */
export const MARKER_NAME = '.template-source';

/** 骨架 `package.json` 里未被替换的包名占位符, 作为门控的第二判据。 */
export const NAME_PLACEHOLDER = '<ext-name>';

/**
 * A 类共享文件: 与插件内容完全无关, 复制后不要改动。
 *
 * 这是唯一真源 —— 增删条目后跑 `node scripts/check-template.mjs --update` 重写基线。
 * 顺序即清单的输出顺序, 保持稳定可以让派生仓库同步时的 diff 只有 hash 变化。
 */
export const SHARED_FILES = [
  '.github/workflows/release.yml',
  '.gitignore',
  '.nvmrc',
  '.vscode/launch.json',
  '.vscode/tasks.json',
  '.vscodeignore',
  'build.mjs',
  'scripts/changelog-section.mjs',
  'scripts/check-template.mjs',
  'scripts/check.mjs',
  'scripts/gen-icon.mjs',
  'scripts/lib/check-manifest.mjs',
  'scripts/lib/icon-render.mjs',
  'scripts/lib/template-shared.mjs',
  'scripts/lib/vsix-allowlist.mjs',
  'scripts/package.mjs',
  'tsconfig.json',
  'vitest.config.ts',
];

/** 记录用的短 hash: 16 个十六进制字符, 碰撞概率对这个用途足够低, 且一行读得完。 */
export function digest(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 解析清单。
 *
 * 三种行:
 * - `<hash>  <路径>`   追踪行
 * - `!<路径>  <原因>`  排除行, 原因可省略
 * - `#` 开头与空行     忽略 (旧清单的说明注释走这条路被丢掉)
 *
 * 只有路径没有 hash 的裸行仍归入 `tracked` 且 `hash` 为 null, 由 `checkShared` 提示补齐 ——
 * 这是给旧清单留的兜底, 不是新格式的一部分。
 *
 * @param {string} text
 * @returns {{ tracked: { hash: string | null, path: string }[], excluded: { path: string, reason: string }[] }}
 */
export function parseManifest(text) {
  const tracked = [];
  const excluded = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('!')) {
      const body = line.slice(1).trim();
      const separator = body.search(/\s/);
      excluded.push(
        separator === -1
          ? { path: body, reason: '' }
          : { path: body.slice(0, separator), reason: body.slice(separator).trim() },
      );
      continue;
    }

    const match = /^([0-9a-f]{16})\s+(.+)$/.exec(line);
    if (match) tracked.push({ hash: match[1], path: match[2].trim() });
    else tracked.push({ hash: null, path: line });
  }

  return { tracked, excluded };
}

/**
 * 按 `SHARED_FILES` 全量生成清单。
 *
 * 不接收"上一版清单"作为输入 —— 生成结果只取决于 `SHARED_FILES`、排除项与文件当前内容,
 * 因此清单损坏后重跑一次就能完整重建。排除项就地输出, 与追踪行共用同一套行序。
 *
 * @param {object} input
 * @param {{ path: string, reason: string }[]} [input.excluded] 要保留的排除声明
 * @param {(path: string) => string | Buffer} input.readFile
 * @returns {string}
 */
export function renderManifest({ excluded = [], readFile }) {
  const reasonByPath = new Map(excluded.map((entry) => [entry.path, entry.reason]));

  const lines = SHARED_FILES.map((path) => {
    if (reasonByPath.has(path)) {
      const reason = reasonByPath.get(path);
      return reason ? `!${path}  ${reason}` : `!${path}`;
    }
    return `${digest(readFile(path))}  ${path}`;
  });

  return `${lines.join('\n')}\n`;
}

/** 覆盖校验的问题描述里最多列出几个路径, 再多就省略号。 */
const SAMPLE_LIMIT = 3;

const sample = (paths) =>
  `${paths.slice(0, SAMPLE_LIMIT).join(', ')}${paths.length > SAMPLE_LIMIT ? ' …' : ''}`;

/**
 * 核对清单里的每个文件。
 *
 * 先做覆盖校验再逐项比对: 清单被清空, 少了几行, 或混进了 `SHARED_FILES` 之外的条目, 都会在
 * 这一步暴露。以前只逐项比对, 空清单会报告"通过 (0 个文件)"—— 检查在最该报警的时候最安静。
 *
 * @param {object} input
 * @param {string} input.manifestText
 * @param {(path: string) => string | Buffer | undefined} input.readFile 读不到时返回 undefined
 * @returns {string[]} 问题描述; 空数组表示通过
 */
export function checkShared({ manifestText, readFile }) {
  const problems = [];
  const { tracked, excluded } = parseManifest(manifestText);

  // ── 覆盖校验 ────────────────────────────────────────────
  const declared = new Set([...tracked.map((entry) => entry.path), ...excluded.map((entry) => entry.path)]);
  const expected = new Set(SHARED_FILES);

  const missing = SHARED_FILES.filter((path) => !declared.has(path));
  const unknown = [...declared].filter((path) => !expected.has(path));

  if (missing.length > 0 || unknown.length > 0) {
    const detail = [
      missing.length > 0 ? `缺少 ${missing.length} 项 (${sample(missing)})` : '',
      unknown.length > 0 ? `多出 ${unknown.length} 项 (${sample(unknown)})` : '',
    ]
      .filter(Boolean)
      .join('; ');

    problems.push(
      `${MANIFEST_NAME} 与 SHARED_FILES 不一致: ${detail} —— 清单是生成物, ` +
        '在骨架仓库跑 check-template.mjs --update 重新生成, 派生仓库则从骨架同步这份文件',
    );
    // 覆盖都对不上时, 逐项比对的结果没有参考价值。
    return problems;
  }

  // ── 逐项比对 ────────────────────────────────────────────
  for (const entry of tracked) {
    const content = readFile(entry.path);

    if (content === undefined) {
      problems.push(
        `${entry.path}: 是 A 类文件但本仓库没有 —— 从骨架同步这个文件; ` +
          `本仓库有意不要它就在 ${MANIFEST_NAME} 里改成 !${entry.path}  <原因>`,
      );
      continue;
    }

    if (entry.hash === null) {
      problems.push(
        `${entry.path}: 清单里没有记录 hash, 在骨架仓库跑 check-template.mjs --update 补齐`,
      );
      continue;
    }

    const actual = digest(content);
    if (actual !== entry.hash) {
      problems.push(
        `${entry.path}: 已偏离骨架 (清单 ${entry.hash}, 实际 ${actual}) —— 从骨架同步这个文件; ` +
          `确实要长期偏离就在 ${MANIFEST_NAME} 里改成 !${entry.path}  <原因>`,
      );
    }
  }

  return problems;
}

/**
 * 判断当前仓库是不是骨架本身。
 *
 * 两个判据取「与」, 各自堵一种失效方式:
 * - **标记文件**表达意图, 但它会被 `cp -R` 一起带到派生仓库;
 * - **包名仍是占位符**复制不走 —— 派生仓库落地第一步就是替换它。
 *
 * @param {object} input
 * @param {boolean} input.hasMarker 仓库根目录下是否存在 `MARKER_NAME`
 * @param {string | undefined} input.packageName `package.json` 的 `name`
 * @returns {boolean}
 */
export function isSkeletonRepo({ hasMarker, packageName }) {
  return hasMarker === true && packageName === NAME_PLACEHOLDER;
}
