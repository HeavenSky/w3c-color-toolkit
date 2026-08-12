/**
 * 变量上下文的收集与解析入口。
 *
 * 跨文件导入受三重限制: 深度上限、文件数上限、循环检测;
 * 未受信任工作区不跨文件读取, 但仍解析当前文档。
 */
import { parseColorText, type ParseOptions } from '../core/parser.js';
import type { ResolvedColor } from '../core/types.js';

import {
  collectCssCustomProperties,
  expandVarChain,
  expandVarReferences,
  resolveCssCustomProperty,
} from './css-custom-properties.js';
import { collectLessVariables } from './less-variables.js';
import { collectScssVariables, resolvePreprocessorVariable } from './scss-variables.js';
import { collectStylusVariables } from './stylus-variables.js';
import type {
  CollectOptions,
  FileReader,
  TextDocumentLike,
  VariableContext,
  VariableDefinition,
  VariableIssue,
  VariableResolution,
} from './types.js';

/** `@import 'a', 'b';` 与 `@use 'a';`。 */
const IMPORT_RULE = /@(?:import|use|forward)\s+([^;]+);/g;
const IMPORT_SPECIFIER = /['"]([^'"]+)['"]/g;

/** `@color-profile --name { ... fallback: <color>; ... }` */
const COLOR_PROFILE = /@color-profile\s+(--[A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
const FALLBACK_DESCRIPTOR = /fallback\s*:\s*([^;}]+)/;

let contextVersion = 0;

function collectDefinitions(
  document: TextDocumentLike,
  definitions: Map<string, VariableDefinition[]>,
): void {
  collectCssCustomProperties(document, definitions);
  switch (document.languageId) {
    case 'scss':
    case 'sass':
      collectScssVariables(document, definitions, 'scss');
      break;
    case 'less':
      collectLessVariables(document, definitions);
      break;
    case 'stylus':
      collectStylusVariables(document, definitions);
      break;
    default:
      // 其他语言只收集 CSS 自定义属性。
      break;
  }
}

function collectColorProfiles(
  document: TextDocumentLike,
  parseOptions: ParseOptions,
  fallbacks: Map<string, ResolvedColor>,
): void {
  const text = document.getText();
  COLOR_PROFILE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COLOR_PROFILE.exec(text)) !== null) {
    const name = match[1];
    const body = match[2];
    const fallback = FALLBACK_DESCRIPTOR.exec(body);
    if (!fallback) continue;
    const parsed = parseColorText(fallback[1].trim(), parseOptions);
    if (parsed?.resolved) fallbacks.set(name, parsed.resolved);
  }
}

function importSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  IMPORT_RULE.lastIndex = 0;
  let rule: RegExpExecArray | null;
  while ((rule = IMPORT_RULE.exec(text)) !== null) {
    IMPORT_SPECIFIER.lastIndex = 0;
    let specifier: RegExpExecArray | null;
    while ((specifier = IMPORT_SPECIFIER.exec(rule[1])) !== null) {
      specifiers.push(specifier[1]);
    }
  }
  return specifiers;
}

/**
 * 只收集当前文档的定义与 `@color-profile`, 不跨文件。
 *
 * 存在的意义是**同步**: 跨文件收集必须 await 文件读取, 而索引层的 `ensure()` 与高亮渲染
 * 都在同步路径上。先用本文档的定义解析一遍, 跨文件的部分再由异步补丁补上, 用户就不必等
 * 一轮 I/O 才看到同一文件内定义的变量。
 *
 * `version` 恒为 0: 索引失效键由 `DocumentIndexManager` 自己的计数器提供, 这里的版本号
 * 不参与任何判定 (模块级的 `contextVersion` 每次调用即自增, 拿它当键会导致
 * "收集 → 键变 → 重扫 → 再收集" 永不收敛)。
 */
export function collectLocalVariableContext(
  document: TextDocumentLike,
  parseOptions: ParseOptions,
): VariableContext {
  const definitions = new Map<string, VariableDefinition[]>();
  const colorProfileFallbacks = new Map<string, ResolvedColor>();
  collectDefinitions(document, definitions);
  collectColorProfiles(document, parseOptions, colorProfileFallbacks);
  return { definitions, colorProfileFallbacks, version: 0, issues: [] };
}

/** 收集变量上下文。 */
export async function collectVariableContext(
  document: TextDocumentLike,
  options: CollectOptions,
  reader: FileReader,
  parseOptions: ParseOptions,
): Promise<VariableContext> {
  contextVersion += 1;
  const definitions = new Map<string, VariableDefinition[]>();
  const colorProfileFallbacks = new Map<string, ResolvedColor>();
  const issues: VariableIssue[] = [];

  collectDefinitions(document, definitions);
  collectColorProfiles(document, parseOptions, colorProfileFallbacks);

  if (!options.resolveVariables) {
    return { definitions, colorProfileFallbacks, version: contextVersion, issues };
  }

  if (!reader.isTrusted()) {
    issues.push({ kind: 'untrusted-workspace', detail: document.uri });
    return { definitions, colorProfileFallbacks, version: contextVersion, issues };
  }

  const visited = new Set<string>([document.uri]);
  let filesRead = 0;

  const walk = async (
    current: TextDocumentLike,
    depth: number,
  ): Promise<void> => {
    if (depth >= options.maxImportDepth) {
      issues.push({ kind: 'max-depth', detail: current.uri });
      return;
    }
    for (const specifier of importSpecifiers(current.getText())) {
      if (filesRead >= options.maxImportFiles) {
        issues.push({ kind: 'import-not-allowed', detail: `file limit ${options.maxImportFiles}` });
        return;
      }
      const candidates = reader.resolveImport(current.uri, specifier, options.includePaths);
      if (candidates.length === 0) {
        issues.push({ kind: 'import-not-allowed', detail: specifier });
        continue;
      }
      for (const candidate of candidates) {
        if (visited.has(candidate)) {
          // 循环导入: 记录一次即可, 不再递归。
          issues.push({ kind: 'circular', detail: candidate });
          continue;
        }
        const text = await reader.read(candidate);
        if (text === undefined) continue;
        visited.add(candidate);
        filesRead += 1;
        const imported: TextDocumentLike = {
          uri: candidate,
          languageId: current.languageId,
          getText: () => text,
        };
        collectDefinitions(imported, definitions);
        collectColorProfiles(imported, parseOptions, colorProfileFallbacks);
        await walk(imported, depth + 1);
        break;
      }
    }
  };

  await walk(document, 0);

  return { definitions, colorProfileFallbacks, version: contextVersion, issues };
}

/** 解析一个变量引用。 */
export function resolveVariable(
  name: string,
  atOffset: number,
  context: VariableContext,
  maxResolveDepth: number,
): VariableResolution {
  if (name.startsWith('--')) {
    const resolution = resolveCssCustomProperty(name, context);
    if (resolution.kind !== 'resolved') return resolution;
    const expanded = expandVarChain(resolution.rawValue, context, maxResolveDepth);
    return { kind: 'resolved', rawValue: expanded.text };
  }
  return resolvePreprocessorVariable(name, atOffset, context, maxResolveDepth);
}

export { expandVarChain, expandVarReferences };
