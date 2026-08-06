/**
 * 从清单推导 VSIX 应当包含的完整文件清单。
 *
 * 用**允许清单**而不是禁止清单: 禁止清单只能拦住预料到的路径, 任何新出现的生成目录都会
 * 静默混进包里。清单从 `package.json` 与仓库里实际存在的文件推导, 所以加一个贡献点不需要
 * 同时改这里 —— 除了确实引入了新的产物类别 (例如视图容器图标) 的情况。
 *
 * 本模块是纯函数: 目录内容由调用方读好传进来, 便于单测用假清单断言推导规则。
 */

const strip = (path) => path.replace(/^\.\//, '');

/** vsce 会把这几个文档重命名后再放进包里, 因此按打包后的实际名字断言。 */
const RENAMED = { 'README.md': 'readme.md', 'CHANGELOG.md': 'changelog.md' };

const DOCS = ['LICENSE.txt', 'NOTICE.md', 'README.md', 'CHANGELOG.md'];

const NLS = ['package.nls.json', 'package.nls.zh-cn.json'];

/**
 * @param {object} input
 * @param {object} input.pkg          解析后的 package.json
 * @param {string[]} input.rootEntries 仓库根目录下的文件名
 * @param {string[]} input.l10nEntries `pkg.l10n` 目录下的文件名; 无 `pkg.l10n` 时传空数组
 * @returns {Set<string>} VSIX 内应当存在的条目 (相对 `extension/`)
 */
export function deriveAllowlist({ pkg, rootEntries, l10nEntries }) {
  const allowed = new Set(['package.json']);

  allowed.add(strip(pkg.main));
  if (pkg.browser) allowed.add(strip(pkg.browser));
  if (pkg.icon) allowed.add(strip(pkg.icon));

  if (pkg.l10n) {
    const dir = strip(pkg.l10n);
    for (const name of l10nEntries) allowed.add(`${dir}/${name}`);
  }

  // 活动栏等视图容器各有自己的图标, 且与 `pkg.icon` (市场图标) 是不同的产物。
  for (const containers of Object.values(pkg.contributes?.viewsContainers ?? {})) {
    for (const container of containers) {
      if (container.icon) allowed.add(strip(container.icon));
    }
  }

  for (const name of NLS) {
    if (rootEntries.includes(name)) allowed.add(name);
  }

  for (const name of DOCS) {
    if (rootEntries.includes(name)) allowed.add(RENAMED[name] ?? name);
  }

  // README 的其它语言版本保留原名, 例如 README.zh-cn.md。
  for (const name of rootEntries) {
    if (/^README\..+\.md$/.test(name) && name !== 'README.md') allowed.add(name);
  }

  return allowed;
}
