import { describe, expect, it } from 'vitest';

import {
  NAME_PLACEHOLDER,
  SHARED_FILES,
  checkShared,
  digest,
  isSkeletonRepo,
  parseManifest,
  renderManifest,
} from '../scripts/lib/template-shared.mjs';
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
  /** 每个 A 类文件的假内容: 用路径本身当内容, 断言时好推算 hash。 */
  const contentOf = (path) => `content of ${path}`;
  const readAll = (path) => contentOf(path);

  /** 一份内容与 `readAll` 匹配的完整清单。 */
  const fullManifest = SHARED_FILES.map((path) => `${digest(contentOf(path))}  ${path}`).join('\n');

  const [FIRST, SECOND] = SHARED_FILES;

  describe('parseManifest', () => {
    it('区分追踪行与排除行, 跳过注释与空行', () => {
      const { tracked, excluded } = parseManifest(
        ['# 说明行', '', `${digest('a')}  a.txt`, '!b.txt  本仓库有意偏离'].join('\n'),
      );
      expect(tracked).toEqual([{ hash: digest('a'), path: 'a.txt' }]);
      expect(excluded).toEqual([{ path: 'b.txt', reason: '本仓库有意偏离' }]);
    });

    it('排除行的原因可以省略', () => {
      const { excluded } = parseManifest('!b.txt');
      expect(excluded).toEqual([{ path: 'b.txt', reason: '' }]);
    });

    it('只有路径没有 hash 的旧格式行归入 tracked 且 hash 为 null', () => {
      const { tracked } = parseManifest('legacy.txt');
      expect(tracked).toEqual([{ hash: null, path: 'legacy.txt' }]);
    });
  });

  describe('renderManifest', () => {
    it('按 SHARED_FILES 全量生成, 不依赖上一版清单', () => {
      // 这正是"清单被清空也能重建"的依据: 输入里没有任何旧清单。
      const text = renderManifest({ readFile: readAll });
      const lines = text.trim().split('\n');
      expect(lines).toHaveLength(SHARED_FILES.length);
      expect(lines[0]).toBe(`${digest(contentOf(FIRST))}  ${FIRST}`);
    });

    it('排除项就地输出为 ! 行, 原因一并保留', () => {
      const text = renderManifest({
        excluded: [{ path: SECOND, reason: '本仓库需要额外放行某个产物' }],
        readFile: readAll,
      });
      const lines = text.trim().split('\n');
      expect(lines).toHaveLength(SHARED_FILES.length);
      expect(lines[1]).toBe(`!${SECOND}  本仓库需要额外放行某个产物`);
      expect(text).not.toContain(`  ${SECOND}\n`);
    });

    it('排除项没有原因时只输出路径', () => {
      const text = renderManifest({ excluded: [{ path: SECOND, reason: '' }], readFile: readAll });
      expect(text.split('\n')[1]).toBe(`!${SECOND}`);
    });
  });

  describe('checkShared 覆盖校验', () => {
    it('空清单报告缺项, 而不是静默通过', () => {
      // 旧实现在这里会报告"通过 (0 个文件)", 检查在最该报警的时候最安静。
      const problems = checkShared({ manifestText: '', readFile: readAll });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`缺少 ${SHARED_FILES.length} 项`);
    });

    it('少几行时报告缺少的数量', () => {
      const partial = fullManifest.split('\n').slice(0, -3).join('\n');
      const problems = checkShared({ manifestText: partial, readFile: readAll });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('缺少 3 项');
    });

    it('混进 SHARED_FILES 之外的条目时报告多出', () => {
      const problems = checkShared({
        manifestText: `${fullManifest}\n${digest('x')}  stray.txt`,
        readFile: readAll,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('多出 1 项');
      expect(problems[0]).toContain('stray.txt');
    });

    it('覆盖不全时不再逐项比对 —— 只报一条', () => {
      const problems = checkShared({ manifestText: '', readFile: () => undefined });
      expect(problems).toHaveLength(1);
    });

    it('排除项计入覆盖, 不算缺项', () => {
      const withExclusion = SHARED_FILES.map((path) =>
        path === SECOND ? `!${path}  有意偏离` : `${digest(contentOf(path))}  ${path}`,
      ).join('\n');
      expect(checkShared({ manifestText: withExclusion, readFile: readAll })).toEqual([]);
    });
  });

  describe('checkShared 逐项比对', () => {
    it('内容一致时通过', () => {
      expect(checkShared({ manifestText: fullManifest, readFile: readAll })).toEqual([]);
    });

    it('内容被改动时报告偏离, 并给出 ! 语法的修复动作', () => {
      const problems = checkShared({
        manifestText: fullManifest,
        readFile: (path) => (path === FIRST ? 'changed' : contentOf(path)),
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(FIRST);
      expect(problems[0]).toContain('已偏离骨架');
      expect(problems[0]).toContain(`!${FIRST}`);
    });

    it('文件不存在时的文案与内容偏离不同', () => {
      // 两者的修复动作不同: 一个是去骨架拿文件, 一个是本仓库改坏了。
      const problems = checkShared({
        manifestText: fullManifest,
        readFile: (path) => (path === FIRST ? undefined : contentOf(path)),
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('是 A 类文件但本仓库没有');
      expect(problems[0]).not.toContain('已偏离骨架');
    });

    it('被排除的文件即使内容不符也不报告', () => {
      const withExclusion = SHARED_FILES.map((path) =>
        path === SECOND ? `!${path}  有意偏离` : `${digest(contentOf(path))}  ${path}`,
      ).join('\n');
      const problems = checkShared({
        manifestText: withExclusion,
        readFile: (path) => (path === SECOND ? '完全不同的内容' : contentOf(path)),
      });
      expect(problems).toEqual([]);
    });

    it('未登记 hash 的旧格式行提示补齐', () => {
      const legacy = SHARED_FILES.map((path) =>
        path === FIRST ? path : `${digest(contentOf(path))}  ${path}`,
      ).join('\n');
      const problems = checkShared({ manifestText: legacy, readFile: readAll });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('没有记录 hash');
    });
  });

  describe('isSkeletonRepo', () => {
    it('两个判据都满足才是骨架', () => {
      expect(isSkeletonRepo({ hasMarker: true, packageName: NAME_PLACEHOLDER })).toBe(true);
    });

    it('缺标记文件不算 —— 派生仓库删掉它就退出了', () => {
      expect(isSkeletonRepo({ hasMarker: false, packageName: NAME_PLACEHOLDER })).toBe(false);
    });

    it('包名已替换不算 —— 标记文件被 cp -R 带走时靠这条兜底', () => {
      expect(isSkeletonRepo({ hasMarker: true, packageName: 'some-derived-ext' })).toBe(false);
    });

    it('两个都不满足自然不算', () => {
      expect(isSkeletonRepo({ hasMarker: false, packageName: 'some-derived-ext' })).toBe(false);
    });

    it('读不到 package.json 时按非骨架处理', () => {
      expect(isSkeletonRepo({ hasMarker: true, packageName: undefined })).toBe(false);
    });
  });
});
