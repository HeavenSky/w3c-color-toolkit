/**
 * 基于 `vscode.workspace.fs` 的文件读取, 以及变量索引用的样式文件来源。
 *
 * 安全约束:
 * - 只读取工作区文件夹内部的文件, 拒绝绝对路径与向上跳出工作区的相对路径;
 * - 只读取允许的扩展名;
 * - 未受信任工作区直接返回不受信任, 由调用方降级为"只解析当前文档"。
 */
import * as vscode from 'vscode';

import type { FileReader, StyleFileEvent, StyleFileSource } from './types.js';

const ALLOWED_EXTENSIONS: readonly string[] = Object.freeze([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
]);

function hasAllowedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isInsideWorkspace(uri: vscode.Uri): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return false;
  const base = folder.uri.toString();
  const target = uri.toString();
  return target === base || target.startsWith(base.endsWith('/') ? base : `${base}/`);
}

/** `a/b/c.scss` + `../d` → `a/d`; 结果仍需通过工作区检查。 */
function joinPath(fromUri: vscode.Uri, specifier: string): vscode.Uri {
  return vscode.Uri.joinPath(fromUri.with({ path: dirname(fromUri.path) }), specifier);
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? path : path.slice(index + 1);
}

/** Sass 的 partial 与省略扩展名规则。 */
function candidatesFor(uri: vscode.Uri): vscode.Uri[] {
  const path = uri.path;
  if (hasAllowedExtension(path)) return [uri];
  const name = basename(path);
  const dir = dirname(path);
  const out: vscode.Uri[] = [];
  for (const extension of ALLOWED_EXTENSIONS) {
    out.push(uri.with({ path: `${path}${extension}` }));
    out.push(uri.with({ path: `${dir}/_${name}${extension}` }));
  }
  return out;
}

export function createWorkspaceFileReader(): FileReader {
  return {
    isTrusted(): boolean {
      return vscode.workspace.isTrusted;
    },

    resolveImport(fromUri: string, specifier: string, includePaths: readonly string[]): string[] {
      // 绝对路径与协议形式的 specifier 一律拒绝。
      if (specifier.startsWith('/') || /^[a-z]+:\/\//i.test(specifier)) return [];
      if (specifier.startsWith('~')) return [];

      let base: vscode.Uri;
      try {
        base = vscode.Uri.parse(fromUri, true);
      } catch {
        return [];
      }

      const roots: vscode.Uri[] = [base];
      const folder = vscode.workspace.getWorkspaceFolder(base);
      if (folder) {
        for (const includePath of includePaths) {
          // 只接受工作区相对路径。
          if (includePath.startsWith('/') || includePath.includes('..')) continue;
          roots.push(vscode.Uri.joinPath(folder.uri, includePath, 'placeholder'));
        }
      }

      const out: string[] = [];
      for (const root of roots) {
        const resolved = joinPath(root, specifier);
        for (const candidate of candidatesFor(resolved)) {
          if (!isInsideWorkspace(candidate)) continue;
          if (!hasAllowedExtension(candidate.path)) continue;
          out.push(candidate.toString());
        }
      }
      return out;
    },

    async read(uri: string): Promise<string | undefined> {
      if (!vscode.workspace.isTrusted) return undefined;
      let parsed: vscode.Uri;
      try {
        parsed = vscode.Uri.parse(uri, true);
      } catch {
        return undefined;
      }
      if (!isInsideWorkspace(parsed) || !hasAllowedExtension(parsed.path)) return undefined;
      try {
        const bytes = await vscode.workspace.fs.readFile(parsed);
        return new TextDecoder().decode(bytes);
      } catch {
        // 文件不存在或不可读: 交给调用方按 candidate 列表继续尝试。
        return undefined;
      }
    },
  };
}

/**
 * 变量索引不该扫的目录。
 *
 * 用固定排除而不是读 `files.exclude`: 后者是编辑器的显示设置, 用户可能只是不想在
 * 资源管理器里看到某个目录, 与"这里的变量定义算不算数"无关。
 */
const INDEX_EXCLUDE = '**/{node_modules,dist,out,build,coverage,.git,.next,.nuxt,.svelte-kit}/**';

/** 已打开的文档 (可能是脏的); 索引优先用编辑器内容而不是磁盘内容。 */
function openDocumentText(uri: string): string | undefined {
  for (const document of vscode.workspace.textDocuments) {
    if (document.uri.toString() === uri) return document.getText();
  }
  return undefined;
}

/**
 * 变量索引的样式文件来源。
 *
 * `list` 逐 glob 调 `findFiles` 再合并去重: `findFiles` 只接受单个 GlobPattern,
 * 而 `variables.lookupGlobs` 是一个列表。多要一个名额 (`maxFiles + 1`) 用来判断是否被截断。
 */
export function createStyleFileSource(): StyleFileSource {
  const reader = createWorkspaceFileReader();

  return {
    async list(globs, maxFiles) {
      const uris = new Set<string>();
      let truncated = false;
      for (const glob of globs) {
        if (uris.size >= maxFiles) {
          truncated = true;
          break;
        }
        const found = await vscode.workspace.findFiles(glob, INDEX_EXCLUDE, maxFiles + 1);
        if (found.length > maxFiles) truncated = true;
        for (const uri of found) {
          if (!hasAllowedExtension(uri.path)) continue;
          if (uris.size >= maxFiles) {
            truncated = true;
            break;
          }
          uris.add(uri.toString());
        }
      }
      return { uris: [...uris], truncated };
    },

    async read(uri) {
      // 编辑中的内容优先: 用户刚敲进去的定义应当立刻可用, 不必等保存。
      const open = openDocumentText(uri);
      if (open !== undefined) return open;
      return reader.read(uri);
    },

    resolveImport(fromUri, specifier) {
      // 发现范围由 glob 负责, 这里只做"明确写了 @import 却不在 glob 里"的补充,
      // 因此不需要额外的搜索根。
      return reader.resolveImport(fromUri, specifier, []);
    },

    watch(globs, listener) {
      const watchers = globs.map((glob) => vscode.workspace.createFileSystemWatcher(glob));
      const disposables: vscode.Disposable[] = [...watchers];
      const emit = (uri: vscode.Uri, kind: StyleFileEvent['kind']): void => {
        if (!hasAllowedExtension(uri.path)) return;
        listener({ uri: uri.toString(), kind });
      };
      for (const watcher of watchers) {
        disposables.push(
          watcher.onDidCreate((uri) => emit(uri, 'upsert')),
          watcher.onDidChange((uri) => emit(uri, 'upsert')),
          watcher.onDidDelete((uri) => emit(uri, 'delete')),
        );
      }
      return () => {
        for (const disposable of disposables) disposable.dispose();
      };
    },
  };
}

export { ALLOWED_EXTENSIONS };
