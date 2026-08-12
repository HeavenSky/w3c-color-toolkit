/**
 * 样式表 AST 事实提取: 把一份文档变成"声明 + 祖先链 + offset"的扁平记录。
 *
 * 为什么用 PostCSS 而不是正则:
 * 注释、字符串、嵌套与条件 at-rule 这一整类结构性问题只有真 AST 才能一次性解决。
 * 实测两条关键行为 (postcss 8.5.26):
 * - `/* --a: red; *\/` 是 Comment 节点, 不会出现在 `walkDecls` 里 —— 注释掉的定义
 *   不再毒化真定义;
 * - `--a: /* x *\/ #ff8800` 的 `decl.value` 已经是 `#ff8800` —— 值里的注释由 PostCSS 剥离。
 *
 * 方言差异同样由语法包吸收, 本文件只做归一化:
 * - SCSS 的 `$a: v !default` 是普通 Declaration, 值尾部的 `!default` / `!global` 在这里剥掉;
 * - Less 的 `@a: v` 是 `variable === true` 的 AtRule, 在这里翻译成 `@a` 声明;
 * - Stylus 不解析变量 (方案 D3), 因此没有对应语法包。
 *
 * 本文件不判断"哪个定义有效", 那是 `variable-definitions.ts` 与解析器的职责。
 */
import postcss, {
  type AtRule,
  type ChildNode,
  type Container,
  type Document,
  type Root,
  type Rule,
} from 'postcss';
import { parse as parseLess } from 'postcss-less';
import { parse as parseScss } from 'postcss-scss';

import type { TextDocumentLike } from './types.js';

/** 声明所在的一层容器。 */
export type StyleAncestor =
  | { readonly kind: 'rule'; readonly selector: string }
  | { readonly kind: 'at-rule'; readonly name: string; readonly params: string };

export interface StyleDeclaration {
  /** 含前缀的名字: `--brand`、`$brand`、`@brand`, 或普通属性名如 `fallback`。 */
  readonly prop: string;
  /** 值; 已 trim, 注释由 PostCSS 剥离, SCSS 的 `!default` / `!global` 已去掉。 */
  readonly value: string;
  /** 由外到内的祖先链; 顶层声明为空数组。 */
  readonly ancestors: readonly StyleAncestor[];
  /** 声明起点的 UTF-16 offset。 */
  readonly offset: number;
}

export interface StylesheetFacts {
  readonly declarations: readonly StyleDeclaration[];
  /** `@import` / `@use` / `@forward` 的 specifier, 已去引号。 */
  readonly imports: readonly string[];
  /** 解析失败 (语法错误); 此时其余字段为空, 调用方按"该文件不贡献事实"处理。 */
  readonly failed: boolean;
  readonly errorMessage?: string;
}

/** 祖先链的文本形式, 例如 `['@layer base', ':root']`。 */
export function ancestorChain(ancestors: readonly StyleAncestor[]): string[] {
  return ancestors.map((ancestor) =>
    ancestor.kind === 'rule' ? ancestor.selector : `@${ancestor.name} ${ancestor.params}`.trim(),
  );
}

/** 跟踪导入的 at-rule。 */
const IMPORT_AT_RULES: ReadonlySet<string> = new Set(['import', 'use', 'forward']);

/** SCSS 赋值标志; 它们不属于值本身。 */
const SCSS_FLAGS: readonly string[] = ['!default', '!global'];

function stripScssFlags(value: string): string {
  let out = value.trim();
  for (;;) {
    const lower = out.toLowerCase();
    const flag = SCSS_FLAGS.find((candidate) => lower.endsWith(candidate));
    if (!flag) return out;
    out = out.slice(0, out.length - flag.length).trim();
  }
}

/**
 * `@import 'a', 'b';` → `['a', 'b']`。
 *
 * 只取引号内的部分, 不用正则: params 已经由 PostCSS 切出来, 这里只是按引号分段。
 */
function importSpecifiers(params: string): string[] {
  const out: string[] = [];
  let quote: string | undefined;
  let current = '';
  for (const char of params) {
    if (quote === undefined) {
      if (char === '"' || char === "'") quote = char;
      continue;
    }
    if (char === quote) {
      if (current.length > 0) out.push(current);
      current = '';
      quote = undefined;
      continue;
    }
    current += char;
  }
  return out;
}

/**
 * 由外到内的祖先链。
 *
 * `Container` 是联合类型, `type` 判别不足以让 TypeScript 收窄到 `Rule` / `AtRule`
 * (它们的 `selector` / `name` 不在联合的公共成员里), 因此按 `type` 判定后显式断言。
 */
function ancestorsOf(node: ChildNode): StyleAncestor[] {
  const chain: StyleAncestor[] = [];
  // `Container.parent` 还可能是 `Document` (postcss-html 这类多文档语法), 因此联合里带上它。
  let parent: Container | Document | undefined = node.parent;
  while (parent && parent.type !== 'root' && parent.type !== 'document') {
    if (parent.type === 'rule') {
      chain.unshift({ kind: 'rule', selector: (parent as Rule).selector });
    } else if (parent.type === 'atrule') {
      const atRule = parent as AtRule;
      chain.unshift({ kind: 'at-rule', name: atRule.name, params: atRule.params });
    }
    parent = parent.parent;
  }
  return chain;
}

/** 按语言选语法包; 未知语言按标准 CSS 处理。 */
function syntaxFor(languageId: string): { parse: (css: string) => Root } {
  switch (languageId) {
    // `sass` 的缩进语法没有 PostCSS 官方语法包; 沿用 scss 语法, 缩进写法会解析失败并按
    // 「解析失败即不贡献事实」降级 —— 与改造前"正则也认不出缩进语法"的能力持平。
    case 'scss':
    case 'sass':
      return { parse: (css) => parseScss(css) };
    case 'less':
      return { parse: (css) => parseLess(css) };
    default:
      return { parse: (css) => postcss.parse(css, { from: undefined }) };
  }
}

/**
 * 读取一份文档的样式表事实。
 *
 * 解析失败不抛: 一个坏文件只让自己不贡献定义, 不能让整个索引失败 (方案 D8)。
 */
export function readStylesheet(document: TextDocumentLike): StylesheetFacts {
  let root: Root;
  try {
    root = syntaxFor(document.languageId).parse(document.getText());
  } catch (error) {
    return {
      declarations: [],
      imports: [],
      failed: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const declarations: StyleDeclaration[] = [];
  const imports: string[] = [];

  root.walk((node) => {
    if (node.type === 'decl') {
      declarations.push({
        prop: node.prop,
        value: stripScssFlags(node.value),
        ancestors: ancestorsOf(node),
        offset: node.source?.start?.offset ?? 0,
      });
      return;
    }
    if (node.type !== 'atrule') return;

    // Less 的 `@brand: #ff8800;` 是 at-rule 而不是声明, 这里翻译回声明形态。
    if ((node as { variable?: boolean }).variable === true) {
      declarations.push({
        prop: `@${node.name}`,
        value: stripScssFlags((node as { value?: string }).value ?? node.params),
        ancestors: ancestorsOf(node),
        offset: node.source?.start?.offset ?? 0,
      });
      return;
    }

    if (IMPORT_AT_RULES.has(node.name.toLowerCase())) imports.push(...importSpecifiers(node.params));
  });

  return { declarations, imports, failed: false };
}
