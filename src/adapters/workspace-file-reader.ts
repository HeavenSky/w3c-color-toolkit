/**
 * 基于 `vscode.workspace.fs` 的文件读取。
 *
 * 安全约束:
 * - 只读取工作区文件夹内部的文件, 拒绝绝对路径与向上跳出工作区的相对路径;
 * - 只读取允许的扩展名;
 * - 未受信任工作区直接返回不受信任, 由调用方降级为"只解析当前文档"。
 */
import * as vscode from 'vscode';

import type { FileReader } from './types.js';

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

export { ALLOWED_EXTENSIONS };
