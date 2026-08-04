/**
 * Node Extension Host 的文件读取实现。
 *
 * 即使在 Node 侧也统一使用 `vscode.workspace.fs` 与 `vscode.Uri`,
 * 不使用 `fs`/`path`, 以保证 Remote 与 Web 行为一致 (方案第 9 节)。
 * 因此本文件与 `imports-web.ts` 目前共用同一实现, 分成两个文件只是为了
 * 保留将来分别优化的接缝, 并让两个 bundle 的依赖边界显式可见。
 */
export { createWorkspaceFileReader } from './workspace-file-reader.js';
