/**
 * 隐身闸门的纯逻辑断言: gitignore 匹配器与三条件判定。
 *
 * 这里覆盖的是"闸门在什么情况下拦"; 闸门被接到哪些路径上属于 vscode 行为,
 * 由方案的人工验收项覆盖。
 */
import { describe, expect, it } from 'vitest';

import {
  BYTES_PER_MB,
  disableReason,
  invalidPatterns,
  type DisableInput,
  type DisableRules,
} from '../../src/configuration/disable-filter.js';
import { compilePatterns, matchesPatterns } from '../../src/configuration/gitignore-match.js';

/** 默认规则: 等价于改造前的默认行为 (阈值 2 MB, 不禁用任何文件)。 */
const DEFAULT_RULES: DisableRules = { maxFileSizeMb: 2, fileNames: [], languageIds: [] };

const input = (overrides: Partial<DisableInput> = {}): DisableInput => ({
  baseName: 'theme.css',
  languageId: 'css',
  length: 1000,
  ...overrides,
});

const matches = (patterns: readonly string[], name: string): boolean =>
  matchesPatterns(compilePatterns(patterns), name);

describe('gitignore 匹配器', () => {
  it('字面量与 * 通配', () => {
    expect(matches(['theme.css'], 'theme.css')).toBe(true);
    expect(matches(['theme.css'], 'other.css')).toBe(false);
    expect(matches(['*.min.css'], 'app.min.css')).toBe(true);
    expect(matches(['*.min.css'], 'app.css')).toBe(false);
    expect(matches(['*'], 'anything')).toBe(true);
  });

  it('? 匹配单个字符', () => {
    expect(matches(['a?.css'], 'ab.css')).toBe(true);
    expect(matches(['a?.css'], 'abc.css')).toBe(false);
  });

  it('字符类, 含 [!…] 取反', () => {
    expect(matches(['[ab].css'], 'a.css')).toBe(true);
    expect(matches(['[ab].css'], 'c.css')).toBe(false);
    expect(matches(['[!ab].css'], 'c.css')).toBe(true);
    expect(matches(['[!ab].css'], 'a.css')).toBe(false);
  });

  it('未闭合的 [ 退化为字面量', () => {
    expect(matches(['[abc.css'], '[abc.css')).toBe(true);
  });

  it('后者覆盖前者, ! 表示重新启用', () => {
    expect(matches(['*.min.css', '!vendor.min.css'], 'vendor.min.css')).toBe(false);
    expect(matches(['*.min.css', '!vendor.min.css'], 'app.min.css')).toBe(true);
    // 顺序相反时 `*.min.css` 是最后一个命中的模式, 因此重新命中。
    expect(matches(['!vendor.min.css', '*.min.css'], 'vendor.min.css')).toBe(true);
  });

  it('\\! 前缀表示字面量 !', () => {
    expect(matches(['\\!important.css'], '!important.css')).toBe(true);
  });

  it('空行与 # 注释被跳过', () => {
    const compiled = compilePatterns(['', '   ', '# 注释', '*.css']);
    expect(compiled.patterns).toHaveLength(1);
    expect(compiled.invalid).toEqual([]);
  });

  it('含 / 的模式无效: 记入 invalid 且不参与匹配', () => {
    const compiled = compilePatterns(['src/*.css', '/root.css', 'dist/', '*.min.css']);
    expect(compiled.invalid).toEqual(['src/*.css', '/root.css', 'dist/']);
    expect(compiled.patterns).toHaveLength(1);
    // 不能被"剥离斜杠后按剩余部分匹配"
    expect(matchesPatterns(compiled, 'app.css')).toBe(false);
    expect(matchesPatterns(compiled, 'app.min.css')).toBe(true);
  });

  it('只有 ! 的模式无效', () => {
    expect(compilePatterns(['!']).invalid).toEqual(['!']);
  });

  it('** 等价于 *', () => {
    expect(matches(['**.css'], 'a.b.css')).toBe(true);
    expect(matches(['a**b'], 'axxb')).toBe(true);
  });

  it('大小写不敏感', () => {
    expect(matches(['*.md'], 'README.MD')).toBe(true);
    expect(matches(['Dockerfile'], 'dockerfile')).toBe(true);
  });

  it('正则元字符按字面量处理', () => {
    expect(matches(['a+b.css'], 'a+b.css')).toBe(true);
    expect(matches(['a+b.css'], 'aab.css')).toBe(false);
    expect(matches(['a.css'], 'axcss')).toBe(false);
  });
});

describe('三条件隐身判定', () => {
  it('默认规则下不隐身', () => {
    expect(disableReason(input(), DEFAULT_RULES)).toBeUndefined();
    // 1 MB 文档在 2 MB 阈值下仍然启用。
    expect(disableReason(input({ length: BYTES_PER_MB }), DEFAULT_RULES)).toBeUndefined();
  });

  it('超过大小阈值时隐身', () => {
    const rules = { ...DEFAULT_RULES, maxFileSizeMb: 1 };
    expect(disableReason(input({ length: BYTES_PER_MB }), rules)).toBeUndefined();
    expect(disableReason(input({ length: BYTES_PER_MB + 1 }), rules)).toBe('file-size');
  });

  it('阈值支持小数 MB', () => {
    const rules = { ...DEFAULT_RULES, maxFileSizeMb: 1.5 };
    expect(disableReason(input({ length: 1.5 * BYTES_PER_MB }), rules)).toBeUndefined();
    expect(disableReason(input({ length: 1.5 * BYTES_PER_MB + 1 }), rules)).toBe('file-size');
  });

  it('0, 负值与 NaN 都表示不限制', () => {
    for (const maxFileSizeMb of [0, -1, Number.NaN]) {
      const rules = { ...DEFAULT_RULES, maxFileSizeMb };
      expect(disableReason(input({ length: 999 * BYTES_PER_MB }), rules)).toBeUndefined();
    }
  });

  it('文件名命中时隐身', () => {
    const rules = { ...DEFAULT_RULES, fileNames: ['*.min.css'] };
    expect(disableReason(input({ baseName: 'app.min.css' }), rules)).toBe('file-name');
    expect(disableReason(input({ baseName: 'app.css' }), rules)).toBeUndefined();
  });

  it('language id 命中时隐身, 且大小写归一', () => {
    const rules = { ...DEFAULT_RULES, languageIds: ['dockerfile', '*script*'] };
    expect(disableReason(input({ languageId: 'dockerfile' }), rules)).toBe('language-id');
    expect(disableReason(input({ languageId: 'DockerFile' }), rules)).toBe('language-id');
    expect(disableReason(input({ languageId: 'javascript' }), rules)).toBe('language-id');
    expect(disableReason(input({ languageId: 'css' }), rules)).toBeUndefined();
  });

  it('无扩展名文件可由文件名或 language id 任一途径拦下', () => {
    expect(
      disableReason(input({ baseName: 'Dockerfile', languageId: 'dockerfile' }), {
        ...DEFAULT_RULES,
        fileNames: ['Dockerfile'],
      }),
    ).toBe('file-name');
    expect(
      disableReason(input({ baseName: 'Makefile', languageId: 'makefile' }), {
        ...DEFAULT_RULES,
        languageIds: ['makefile'],
      }),
    ).toBe('language-id');
  });

  it('求值顺序: 大小 → 文件名 → language id', () => {
    const rules: DisableRules = {
      maxFileSizeMb: 0.000001,
      fileNames: ['*.css'],
      languageIds: ['css'],
    };
    expect(disableReason(input(), rules)).toBe('file-size');
    expect(disableReason(input(), { ...rules, maxFileSizeMb: 0 })).toBe('file-name');
    expect(disableReason(input(), { ...rules, maxFileSizeMb: 0, fileNames: [] })).toBe(
      'language-id',
    );
  });

  it('三个条件是或关系, 各自独立', () => {
    const rules = { ...DEFAULT_RULES, fileNames: ['*.min.css'], languageIds: ['plaintext'] };
    expect(disableReason(input({ baseName: 'a.min.css', languageId: 'css' }), rules)).toBe(
      'file-name',
    );
    expect(disableReason(input({ baseName: 'notes.txt', languageId: 'plaintext' }), rules)).toBe(
      'language-id',
    );
    expect(disableReason(input({ baseName: 'a.css', languageId: 'css' }), rules)).toBeUndefined();
  });

  it('! 的作用域限于所在那一组', () => {
    // 文件名组的否定救不回被 language id 组排除的文件。
    const rules = { ...DEFAULT_RULES, fileNames: ['!notes.txt'], languageIds: ['plaintext'] };
    expect(disableReason(input({ baseName: 'notes.txt', languageId: 'plaintext' }), rules)).toBe(
      'language-id',
    );
  });

  it('invalidPatterns 汇总两组的无效模式', () => {
    expect(
      invalidPatterns({ ...DEFAULT_RULES, fileNames: ['src/*.css'], languageIds: ['a/b'] }),
    ).toEqual(['src/*.css', 'a/b']);
    expect(invalidPatterns(DEFAULT_RULES)).toEqual([]);
  });
});
