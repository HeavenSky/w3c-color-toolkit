/**
 * 清单与本地化的一致性检查。
 *
 * 这些漏了都不会让构建失败, 只会静默丢文案或让设置界面对不上实现, 所以必须有独立的门。
 * 每个函数返回问题描述数组, 空数组表示通过。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** 递归收集某目录下的 .ts 文件。 */
function collectTsFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...collectTsFiles(path));
    else if (name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/**
 * `package.nls.json` 与 `package.nls.zh-cn.json` 的 key 集必须相同,
 * 且与 `package.json` 里用到的 `%...%` 占位符一一对应。
 *
 * 双向断言: 缺 key 会让界面显示成 `%config.foo%`, 多 key 是无人使用的死文案。
 */
export function checkNlsParity(root) {
  const problems = [];
  const en = Object.keys(readJson(join(root, 'package.nls.json'))).sort();
  const zh = Object.keys(readJson(join(root, 'package.nls.zh-cn.json'))).sort();
  const manifest = readFileSync(join(root, 'package.json'), 'utf8');
  const used = [...new Set([...manifest.matchAll(/%([\w.-]+)%/g)].map((m) => m[1]))].sort();

  const diff = (a, b) => a.filter((key) => !b.includes(key));

  for (const key of diff(en, zh)) problems.push(`package.nls.zh-cn.json 缺少 key: ${key}`);
  for (const key of diff(zh, en)) problems.push(`package.nls.json 缺少 key: ${key}`);
  for (const key of diff(used, en)) problems.push(`清单用到但 package.nls 未定义的占位符: %${key}%`);
  for (const key of diff(en, used)) problems.push(`package.nls 定义了但清单未使用的 key: ${key}`);

  return problems;
}

/** `l10n/` 下所有 bundle 的 key 集必须一致, 否则某个语言会缺文案。 */
export function checkL10nBundleParity(root, l10nDir = 'l10n') {
  const problems = [];
  const dir = join(root, l10nDir);
  const bundles = readdirSync(dir).filter((name) => /^bundle\.l10n\..*json$/.test(name));
  if (bundles.length < 2) return problems;

  const [first, ...rest] = bundles;
  const baseline = Object.keys(readJson(join(dir, first))).sort();
  for (const name of rest) {
    const keys = Object.keys(readJson(join(dir, name))).sort();
    for (const key of baseline.filter((k) => !keys.includes(k))) {
      problems.push(`${l10nDir}/${name} 缺少 key: ${key}`);
    }
    for (const key of keys.filter((k) => !baseline.includes(k))) {
      problems.push(`${l10nDir}/${first} 缺少 key: ${key}`);
    }
  }
  return problems;
}

/**
 * `src/` 里内联的 `l10n.t('字面量')` 必须都在中文 bundle 里有对应条目。
 *
 * `vscode.l10n.t` 的 key 就是源码里的英文原文, 所以英语 bundle 是恒等映射, 不需要存在;
 * 中文 bundle 缺条目则会静默回退成英文。字符串表集中声明的仓库 (没有内联字面量) 自动跳过,
 * 由该仓库自己的生成物漂移检查覆盖。
 */
export function checkInlineRuntimeStrings(root, l10nDir = 'l10n') {
  const inline = new Set();
  for (const file of collectTsFiles(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/l10n\.t\(\s*'((?:[^'\\]|\\.)*)'/g)) inline.add(match[1]);
    for (const match of source.matchAll(/l10n\.t\(\s*"((?:[^"\\]|\\.)*)"/g)) inline.add(match[1]);
  }
  if (inline.size === 0) return [];

  const bundlePath = join(root, l10nDir, 'bundle.l10n.zh-cn.json');
  const bundle = readJson(bundlePath);
  const problems = [];
  for (const key of [...inline].sort()) {
    if (!(key in bundle)) problems.push(`${l10nDir}/bundle.l10n.zh-cn.json 缺少运行时文案: ${key}`);
  }
  for (const key of Object.keys(bundle).sort()) {
    if (!inline.has(key)) problems.push(`${l10nDir}/bundle.l10n.zh-cn.json 存在无人使用的条目: ${key}`);
  }
  return problems;
}
