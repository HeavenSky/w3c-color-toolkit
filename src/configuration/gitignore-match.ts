/**
 * gitignore 语法的最小匹配器, 只匹配单个名字, 不处理路径。
 *
 * 为什么自己写而不引 `ignore` / `minimatch`: 匹配对象是文件名与 language id 这两种
 * 不含分隔符的短字符串, 用不到 gitignore 里与目录层级相关的那一半语义; 而扩展的运行时
 * 依赖只有 4 个包, 且必须能在 browser platform 下打包, 引库要连带处理 NOTICE 与体积。
 *
 * 语义:
 * - 空行与 `#` 开头跳过 (gitignore 的注释约定);
 * - `!` 前缀表示否定, `\!` 表示字面量 `!`;
 * - 剥离 `!` 后仍含 `/` 的模式**无效**: 匹配对象里永远没有 `/`, 这种模式必然是用户
 *   误以为可以写路径。剥离斜杠后按剩余部分匹配会把 `src/*.css` 悄悄变成 `*.css`,
 *   所以宁可整条跳过并把它报告出去;
 * - `**` 在没有分隔符的语境里退化成 `*`;
 * - 匹配大小写不敏感: macOS 与 Windows 的文件系统本身不区分大小写;
 * - 顺序敏感, **后者覆盖前者**: 取最后一个命中的模式决定结果, 与 gitignore 一致。
 */

export interface CompiledPattern {
  readonly negated: boolean;
  readonly regex: RegExp;
}

export interface CompiledPatterns {
  readonly patterns: readonly CompiledPattern[];
  /** 被跳过的模式原文, 供调用方告警。 */
  readonly invalid: readonly string[];
}

/** 转义正则元字符; `*` 与 `?` 由调用处单独处理, 不在这里转义。 */
function escapeLiteral(char: string): string {
  return /[\\^$.|+()[\]{}]/.test(char) ? `\\${char}` : char;
}

/**
 * glob → 正则。
 *
 * 字符类 `[...]` 原样保留 (含内部的 `\` 转义与前导 `!` / `^` 取反), 因为 gitignore
 * 的字符类语义与正则一致; 未闭合的 `[` 退化成字面量。
 */
function globToRegExpSource(glob: string): string {
  let source = '';
  let index = 0;

  while (index < glob.length) {
    const char = glob[index];

    if (char === '*') {
      // `**` 与 `*` 在无分隔符的语境里等价。
      while (glob[index] === '*') index += 1;
      source += '.*';
      continue;
    }

    if (char === '?') {
      source += '.';
      index += 1;
      continue;
    }

    if (char === '[') {
      const end = findClassEnd(glob, index);
      if (end === -1) {
        source += '\\[';
        index += 1;
        continue;
      }
      source += normalizeClass(glob.slice(index, end + 1));
      index = end + 1;
      continue;
    }

    if (char === '\\' && index + 1 < glob.length) {
      source += escapeLiteral(glob[index + 1]);
      index += 2;
      continue;
    }

    source += escapeLiteral(char);
    index += 1;
  }

  return source;
}

/** 找到字符类的闭合 `]`; 紧跟在 `[` 或 `[!` / `[^` 之后的 `]` 是字面量。 */
function findClassEnd(glob: string, start: number): number {
  let index = start + 1;
  if (glob[index] === '!' || glob[index] === '^') index += 1;
  if (glob[index] === ']') index += 1;

  while (index < glob.length) {
    if (glob[index] === '\\') {
      index += 2;
      continue;
    }
    if (glob[index] === ']') return index;
    index += 1;
  }
  return -1;
}

/** gitignore 用 `[!…]` 取反, 正则用 `[^…]`。 */
function normalizeClass(text: string): string {
  return text.startsWith('[!') ? `[^${text.slice(2)}` : text;
}

export function compilePatterns(raw: readonly string[]): CompiledPatterns {
  const patterns: CompiledPattern[] = [];
  const invalid: string[] = [];

  for (const entry of raw) {
    const trimmed = entry.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    let negated = false;
    let body = trimmed;
    if (body.startsWith('\\!')) body = body.slice(1);
    else if (body.startsWith('!')) {
      negated = true;
      body = body.slice(1);
    }

    if (body.length === 0 || body.includes('/')) {
      invalid.push(entry);
      continue;
    }

    patterns.push({ negated, regex: new RegExp(`^${globToRegExpSource(body)}$`, 'i') });
  }

  return { patterns, invalid };
}

/** 最后一个命中的模式决定结果; 无命中视为不匹配。 */
export function matchesPatterns(compiled: CompiledPatterns, name: string): boolean {
  let matched: boolean | undefined;
  for (const pattern of compiled.patterns) {
    if (pattern.regex.test(name)) matched = !pattern.negated;
  }
  return matched ?? false;
}
