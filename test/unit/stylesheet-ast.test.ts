/**
 * 样式表 AST 事实提取。
 *
 * 这里锁定"换成真 AST 之后, 哪些结构性缺陷不可能再复发":
 * - 注释掉的定义不再被当成定义 (旧正则实现会让它毒化同名真定义);
 * - 值里的注释不再进入 rawValue (旧实现会让颜色解析失败后静默消失);
 * - 条件 at-rule 与非 root 选择器在祖先链里如实体现, 供解析器判定歧义;
 * - 一个语法错误的文件只让自己不贡献事实, 不抛异常。
 */
import { describe, expect, it } from 'vitest';

import { ancestorChain, readStylesheet, type StyleDeclaration } from '../../src/adapters/stylesheet-ast.js';
import { collectStylesheet } from '../../src/adapters/variable-definitions.js';
import type { TextDocumentLike } from '../../src/adapters/types.js';

function doc(text: string, languageId = 'css', uri = 'file:///w/a.css'): TextDocumentLike {
  return { uri, languageId, getText: () => text };
}

function propOf(declarations: readonly StyleDeclaration[], prop: string): StyleDeclaration | undefined {
  return declarations.find((declaration) => declaration.prop === prop);
}

describe('声明与祖先链', () => {
  it('嵌套 at-rule 与选择器如实出现在祖先链里', () => {
    const facts = readStylesheet(doc('@layer base {\n  /* c */\n  :root { --a: 1 }\n}'));
    expect(facts.failed).toBe(false);
    expect(facts.declarations).toHaveLength(1);
    expect(ancestorChain(facts.declarations[0].ancestors)).toEqual(['@layer base', ':root']);
  });

  it('offset 指向声明起点', () => {
    const text = 'a { color: red }\n:root { --a: blue }';
    const facts = readStylesheet(doc(text));
    const declaration = propOf(facts.declarations, '--a');
    expect(text.slice(declaration?.offset ?? 0)).toMatch(/^--a: blue/);
  });

  it('条件 at-rule 与非 root 选择器都能从祖先链读出来', () => {
    const facts = readStylesheet(
      doc(':root { --a: #fff }\n@media (prefers-color-scheme: dark) { :root { --a: #000 } }\n[data-theme="warm"] { --a: #eee }'),
    );
    expect(facts.declarations.map((d) => ancestorChain(d.ancestors))).toEqual([
      [':root'],
      ['@media (prefers-color-scheme: dark)', ':root'],
      ['[data-theme="warm"]'],
    ]);
  });
});

describe('注释', () => {
  it('注释掉的定义不产生声明', () => {
    const facts = readStylesheet(doc(':root { /* --a: red; */ --a: #ff8800 }'));
    expect(facts.declarations).toHaveLength(1);
    expect(facts.declarations[0].value).toBe('#ff8800');
  });

  it('值里的注释不进入值', () => {
    const facts = readStylesheet(doc(':root { --a: /* c */ #ff8800 }'));
    expect(propOf(facts.declarations, '--a')?.value).toBe('#ff8800');
  });

  it(':root 前面的注释不影响选择器', () => {
    const facts = readStylesheet(
      doc('@layer base {\n  /* shadcn fallbacks */\n  :root { --border: 214.3 31.8% 91.4% }\n}'),
    );
    expect(ancestorChain(facts.declarations[0].ancestors)).toEqual(['@layer base', ':root']);
  });
});

describe('方言', () => {
  it('SCSS 的 $ 变量与 !default 标志', () => {
    const facts = readStylesheet(doc('$brand: #ff8800 !default;\n.x { color: $brand }', 'scss'));
    expect(propOf(facts.declarations, '$brand')?.value).toBe('#ff8800');
  });

  it('Less 的 @ 变量被翻译成声明, at-rule 不被误收', () => {
    const facts = readStylesheet(doc('@brand: #ff8800;\n@import "other";\n.x { color: @brand }', 'less'));
    expect(propOf(facts.declarations, '@brand')?.value).toBe('#ff8800');
    expect(propOf(facts.declarations, '@import')).toBeUndefined();
    expect(facts.imports).toEqual(['other']);
  });

  it('未知语言按标准 CSS 处理', () => {
    // Tailwind CSS IntelliSense 会把 CSS 文件切成 `tailwindcss` 语言。
    const facts = readStylesheet(doc('@tailwind base;\n:root { --a: red }', 'tailwindcss'));
    expect(propOf(facts.declarations, '--a')?.value).toBe('red');
  });

  it('Tailwind 指令不影响解析', () => {
    const facts = readStylesheet(
      doc('@tailwind base;\n@layer components {\n  .card { @apply bg-red-500; }\n  :root { --a: red }\n}'),
    );
    expect(propOf(facts.declarations, '--a')?.value).toBe('red');
  });
});

describe('导入与降级', () => {
  it('收集 @import / @use / @forward 的 specifier', () => {
    const facts = readStylesheet(doc('@import "a", "b";\n@use "c";\n@forward "d";'));
    expect(facts.imports).toEqual(['a', 'b', 'c', 'd']);
  });

  it('url() 形式的 @import 不产生 specifier', () => {
    // 远端样式表不在索引范围内, 没有引号内容可取。
    expect(readStylesheet(doc('@import url(https://example.com/a.css);')).imports).toEqual([]);
  });

  it('语法错误的文件不抛异常, 只是不贡献事实', () => {
    const facts = readStylesheet(doc('.a { color: }}}{'));
    expect(facts.failed).toBe(true);
    expect(facts.declarations).toEqual([]);
    expect(facts.imports).toEqual([]);
    expect(facts.errorMessage).toBeTruthy();
  });
});

describe('定义收集', () => {
  it('自定义属性: root 级无条件定义标 isRoot', () => {
    const { definitions } = collectStylesheet(doc('@layer base { :root { --a: #ff8800 } }'));
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      name: '--a',
      kind: 'css-custom-property',
      rawValue: '#ff8800',
      selector: ':root',
      isRoot: true,
      conditional: false,
      ancestorChain: ['@layer base', ':root'],
    });
  });

  it('条件 at-rule 内的 :root 定义不算无条件生效', () => {
    const { definitions } = collectStylesheet(
      doc('@media (prefers-color-scheme: dark) { :root { --a: #000 } }'),
    );
    expect(definitions[0]).toMatchObject({ isRoot: false, conditional: true });
  });

  it('非 root 选择器下的定义不算无条件生效', () => {
    const { definitions } = collectStylesheet(doc('[data-product="hui"] { --a: 148 163 184 }'));
    expect(definitions[0]).toMatchObject({
      selector: '[data-product="hui"]',
      isRoot: false,
      conditional: false,
    });
  });

  it('选择器列表里有 :root 即算 root', () => {
    const { definitions } = collectStylesheet(doc(':root, html { --a: red }'));
    expect(definitions[0].isRoot).toBe(true);
  });

  it('注释掉的定义不进入定义列表', () => {
    const { definitions } = collectStylesheet(doc(':root { /* --a: red; */ --a: #ff8800 }'));
    expect(definitions).toHaveLength(1);
    expect(definitions[0].rawValue).toBe('#ff8800');
  });

  it('普通属性不是变量定义', () => {
    const { definitions } = collectStylesheet(doc('.x { color: red; background: blue }'));
    expect(definitions).toEqual([]);
  });

  it('预处理器变量: 顶层声明算无条件, 嵌套声明不算', () => {
    const { definitions } = collectStylesheet(
      doc('$a: red;\n.x { $b: blue; color: $a }', 'scss'),
    );
    expect(definitions.map((d) => [d.name, d.kind, d.isRoot])).toEqual([
      ['$a', 'scss', true],
      ['$b', 'scss', false],
    ]);
  });

  it('收集 @color-profile 的 fallback, 其他描述符不算定义', () => {
    const collected = collectStylesheet(
      doc('@color-profile --p { src: url(a.icc); fallback: #123456 }'),
    );
    expect(collected.colorProfileFallbacks).toEqual([{ name: '--p', rawValue: '#123456' }]);
    expect(collected.definitions).toEqual([]);
  });

  it('解析失败的文件不贡献任何定义', () => {
    const collected = collectStylesheet(doc('.a { color: }}}{'));
    expect(collected).toMatchObject({ failed: true, definitions: [], colorProfileFallbacks: [] });
  });

  it('sourceUri 与 offset 一并记录', () => {
    const text = ':root { --a: red }';
    const { definitions } = collectStylesheet(doc(text, 'css', 'file:///w/tokens.css'));
    expect(definitions[0].sourceUri).toBe('file:///w/tokens.css');
    expect(text.slice(definitions[0].offset)).toMatch(/^--a: red/);
  });
});
