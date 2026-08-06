import { describe, expect, it } from 'vitest';

import { checkShared, digest, parseManifest, renderManifest } from '../scripts/lib/template-shared.mjs';
import { deriveAllowlist } from '../scripts/lib/vsix-allowlist.mjs';

/**
 * 门禁自身的测试。
 *
 * 门禁漏判不会让构建失败, 只会静默放过它本该拦住的东西, 因此这两条推导规则必须有断言:
 * 允许清单必须涵盖清单里声明的每一类产物, 漂移检查必须真的比对内容而不是只看文件在不在。
 *
 * 用 `.mjs` 而不是 `.ts`: `tsconfig.json` 没开 `allowJs`, 从 `.ts` 里 import 这些构建脚本
 * 会让 `tsc --noEmit` 报缺声明文件; 反过来 tsc 不收录 `.mjs`, 所以两边都干净。
 */

const basePkg = {
  main: './out/extension.js',
  browser: './out/extension.js',
  icon: 'media/icon.png',
  l10n: './l10n',
};

describe('deriveAllowlist', () => {
  it('涵盖入口, 图标, l10n 目录与存在的文档', () => {
    const allowed = deriveAllowlist({
      pkg: basePkg,
      rootEntries: ['README.md', 'CHANGELOG.md', 'LICENSE.txt', 'package.nls.json', 'src'],
      l10nEntries: ['bundle.l10n.zh-cn.json'],
    });
    expect([...allowed].sort()).toEqual([
      'LICENSE.txt',
      'changelog.md',
      'l10n/bundle.l10n.zh-cn.json',
      'media/icon.png',
      'package.json',
      'package.nls.json',
      'out/extension.js',
      'readme.md',
    ].sort());
  });

  it('不把仓库里没有的文档算进来', () => {
    const allowed = deriveAllowlist({ pkg: basePkg, rootEntries: [], l10nEntries: [] });
    expect(allowed.has('readme.md')).toBe(false);
    expect(allowed.has('NOTICE.md')).toBe(false);
  });

  it('保留 README 的其它语言版本原名', () => {
    const allowed = deriveAllowlist({
      pkg: basePkg,
      rootEntries: ['README.md', 'README.zh-cn.md'],
      l10nEntries: [],
    });
    expect(allowed.has('readme.md')).toBe(true);
    expect(allowed.has('README.zh-cn.md')).toBe(true);
  });

  it('涵盖视图容器图标 (与市场图标是不同产物)', () => {
    const allowed = deriveAllowlist({
      pkg: {
        ...basePkg,
        contributes: { viewsContainers: { activitybar: [{ icon: 'media/panel.svg' }] } },
      },
      rootEntries: [],
      l10nEntries: [],
    });
    expect(allowed.has('media/panel.svg')).toBe(true);
  });

  it('放行入口同目录下的 .wasm, 但不放行其它生成物', () => {
    const allowed = deriveAllowlist({
      pkg: basePkg,
      rootEntries: [],
      l10nEntries: [],
      outEntries: ['extension.js', 'server.wasm', 'extension.js.map', 'stray.bin'],
    });
    expect(allowed.has('out/server.wasm')).toBe(true);
    expect(allowed.has('out/extension.js.map')).toBe(false);
    expect(allowed.has('out/stray.bin')).toBe(false);
  });

  it('省略 outEntries 时行为不变', () => {
    const allowed = deriveAllowlist({ pkg: basePkg, rootEntries: [], l10nEntries: [] });
    expect([...allowed].some((name) => name.endsWith('.wasm'))).toBe(false);
  });

  it('涵盖语言类贡献点引用的文件', () => {
    const allowed = deriveAllowlist({
      pkg: {
        ...basePkg,
        contributes: {
          languages: [
            {
              id: 'toml',
              configuration: './language-configuration.json',
              icon: { light: 'media/toml-light.svg', dark: 'media/toml-dark.svg' },
            },
          ],
          grammars: [{ language: 'toml', path: './syntaxes/toml.tmLanguage.json' }],
          snippets: [{ language: 'toml', path: './snippets/toml.json' }],
        },
      },
      rootEntries: [],
      l10nEntries: [],
    });
    expect(allowed.has('language-configuration.json')).toBe(true);
    expect(allowed.has('media/toml-light.svg')).toBe(true);
    expect(allowed.has('media/toml-dark.svg')).toBe(true);
    expect(allowed.has('syntaxes/toml.tmLanguage.json')).toBe(true);
    expect(allowed.has('snippets/toml.json')).toBe(true);
  });

  it('涵盖 l10n 子目录 (捆绑的第三方语言包)', () => {
    const allowed = deriveAllowlist({
      pkg: basePkg,
      rootEntries: [],
      l10nEntries: ['bundle.l10n.zh-cn.json', 'yaml-server/bundle.l10n.json'],
    });
    expect(allowed.has('l10n/bundle.l10n.zh-cn.json')).toBe(true);
    expect(allowed.has('l10n/yaml-server/bundle.l10n.json')).toBe(true);
  });
});

describe('template-shared', () => {
  const manifest = ['# 说明行', `${digest('a')}  a.txt`, `${digest('b')}  b.txt`].join('\n');

  it('解析时跳过注释与空行', () => {
    expect(parseManifest(manifest)).toEqual([
      { hash: digest('a'), path: 'a.txt' },
      { hash: digest('b'), path: 'b.txt' },
    ]);
  });

  it('内容一致时通过', () => {
    const problems = checkShared({
      manifestText: manifest,
      readFile: (path) => (path === 'a.txt' ? 'a' : 'b'),
    });
    expect(problems).toEqual([]);
  });

  it('内容被改动时报告偏离', () => {
    const problems = checkShared({
      manifestText: manifest,
      readFile: (path) => (path === 'a.txt' ? 'changed' : 'b'),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a.txt');
    expect(problems[0]).toContain('已偏离骨架');
  });

  it('文件缺失与未登记 hash 都会被报告', () => {
    const problems = checkShared({
      manifestText: [`${digest('a')}  a.txt`, 'legacy.txt'].join('\n'),
      readFile: (path) => (path === 'legacy.txt' ? 'x' : undefined),
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('文件不存在');
    expect(problems[1]).toContain('没有记录 hash');
  });

  it('--update 重写 hash 并保留自定义注释', () => {
    const text = renderManifest(
      ['# 偏离原因: 本仓库追加了自有产物行', `${digest('old')}  a.txt`].join('\n'),
      [{ hash: null, path: 'a.txt' }],
      () => 'new',
    );
    expect(text).toContain('# 偏离原因: 本仓库追加了自有产物行');
    expect(text).toContain(`${digest('new')}  a.txt`);
    expect(text).not.toContain(digest('old'));
  });
});
