/**
 * 装饰类型的复用与释放。
 *
 * key 为"最终预览色 + marker 样式", 因此同色同样式只创建一个 decoration type
 * (旧 Color Highlight 每个颜色都新建一个, 会随文件增大持续增长内存)。
 */
import * as vscode from 'vscode';

import type { MarkerType } from '../../configuration/load.js';

export interface DecorationKey {
  readonly cssColor: string;
  readonly foreground?: string;
  readonly markerType: MarkerType;
  readonly markRuler: boolean;
}

function keyOf(key: DecorationKey): string {
  return `${key.markerType}|${key.cssColor}|${key.foreground ?? ''}|${key.markRuler ? 'r' : ''}`;
}

function optionsFor(key: DecorationKey): vscode.DecorationRenderOptions {
  const base: vscode.DecorationRenderOptions = {
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  };
  if (key.markRuler) {
    base.overviewRulerColor = key.cssColor;
    base.overviewRulerLane = vscode.OverviewRulerLane.Right;
  }

  switch (key.markerType) {
    case 'background':
      return { ...base, backgroundColor: key.cssColor, color: key.foreground };
    case 'foreground':
      return { ...base, color: key.cssColor };
    case 'outline':
      return { ...base, outline: `2px solid ${key.cssColor}` };
    case 'underline':
      return {
        ...base,
        textDecoration: `none; border-bottom: 2px solid ${key.cssColor}`,
      };
    case 'dot-before':
      return {
        ...base,
        before: {
          contentText: '•',
          color: key.cssColor,
          margin: '0 0.2em 0 0',
          fontWeight: 'bold',
        },
      };
    case 'dot-after':
      return {
        ...base,
        after: {
          contentText: '•',
          color: key.cssColor,
          margin: '0 0 0 0.2em',
          fontWeight: 'bold',
        },
      };
    default:
      return base;
  }
}

export class DecorationManager implements vscode.Disposable {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  /** 每个编辑器当前使用过的 key, 用于清空不再使用的装饰。 */
  private readonly appliedByEditor = new Map<string, Set<string>>();

  get typeCount(): number {
    return this.types.size;
  }

  private typeFor(key: DecorationKey): vscode.TextEditorDecorationType {
    const id = keyOf(key);
    let type = this.types.get(id);
    if (!type) {
      type = vscode.window.createTextEditorDecorationType(optionsFor(key));
      this.types.set(id, type);
    }
    return type;
  }

  /** 一次性把某个编辑器的全部装饰应用完成。 */
  apply(editor: vscode.TextEditor, groups: ReadonlyMap<string, { key: DecorationKey; ranges: vscode.Range[] }>): void {
    const editorId = editor.document.uri.toString();
    const previous = this.appliedByEditor.get(editorId) ?? new Set<string>();
    const current = new Set<string>();

    for (const [, group] of groups) {
      const id = keyOf(group.key);
      current.add(id);
      editor.setDecorations(this.typeFor(group.key), group.ranges);
    }

    // 上一轮用过但这一轮没有的 key 需要显式清空, 否则残留装饰。
    for (const id of previous) {
      if (current.has(id)) continue;
      const type = this.types.get(id);
      if (type) editor.setDecorations(type, []);
    }
    this.appliedByEditor.set(editorId, current);
  }

  /** 清空某个编辑器的全部装饰。 */
  clear(editor: vscode.TextEditor): void {
    const editorId = editor.document.uri.toString();
    const applied = this.appliedByEditor.get(editorId);
    if (!applied) return;
    for (const id of applied) {
      const type = this.types.get(id);
      if (type) editor.setDecorations(type, []);
    }
    this.appliedByEditor.delete(editorId);
  }

  forget(documentUri: string): void {
    this.appliedByEditor.delete(documentUri);
  }

  dispose(): void {
    for (const type of this.types.values()) type.dispose();
    this.types.clear();
    this.appliedByEditor.clear();
  }
}

export { keyOf as decorationKeyString };
