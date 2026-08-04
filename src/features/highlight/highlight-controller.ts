/**
 * 高亮控制器。
 *
 * 订阅索引更新, 只消费 `resolved` 或已显式采用预览假设的 match;
 * 装饰按 (预览色, 样式) 复用, 编辑器切换与文档关闭时释放。
 *
 * 装饰范围与 Hover 字段共用一份配置: `fields.enabled` / `fields.excluded`
 * 中被关掉的颜色语法不再高亮 (见 `features/fields/registry.ts`)。
 */
import * as vscode from 'vscode';

import type { RuntimeConfiguration } from '../../configuration/load.js';
import type { DocumentIndexManager } from '../../index/document-index-manager.js';
import { isLanguageEnabled } from '../../configuration/language-filter.js';
import { resolveHighlightSyntaxes } from '../fields/registry.js';

import { DecorationManager, type DecorationKey } from './decoration-manager.js';
import { computePreviewColor, previewSource } from './preview-color.js';

export class HighlightController implements vscode.Disposable {
  private readonly decorations = new DecorationManager();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly manager: DocumentIndexManager,
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
  ) {
    this.disposables.push(
      manager.onDidUpdate(({ document }) => this.renderDocument(document)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.renderVisible()),
    );
  }

  /** 供测试与命令使用。 */
  get decorationTypeCount(): number {
    return this.decorations.typeCount;
  }

  renderVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.render(editor);
    }
  }

  renderDocument(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== document.uri.toString()) continue;
      this.render(editor);
    }
  }

  private render(editor: vscode.TextEditor): void {
    const document = editor.document;
    const config = this.getConfig(document);

    if (
      !config.enabled ||
      !config.highlightEnabled ||
      !isLanguageEnabled(config.languages, document.languageId)
    ) {
      this.decorations.clear(editor);
      return;
    }

    const snapshot = this.manager.ensure(document);
    if (!snapshot) {
      this.decorations.clear(editor);
      return;
    }

    const groups = new Map<string, { key: DecorationKey; ranges: vscode.Range[] }>();
    const seenRanges = new Set<string>();
    // 每次渲染构造一次: 字段表只有几十项, 比缓存失效逻辑更简单可靠。
    const syntaxes = resolveHighlightSyntaxes(
      config.fields,
      config.excludedFields,
      config.cssColorHdr,
    );

    for (const match of snapshot.matches) {
      if (!syntaxes.allows(match.syntax)) continue;
      const resolved = previewSource(match);
      if (!resolved) continue;

      // 同一 range 不创建重复装饰。
      const rangeId = `${match.range.start}:${match.range.end}`;
      if (seenRanges.has(rangeId)) continue;
      seenRanges.add(rangeId);

      const preview = computePreviewColor(resolved, config.gamutMapping, config.hdrToneMapping);
      const key: DecorationKey = {
        cssColor: preview.css,
        foreground: config.markerType === 'background' ? preview.foregroundCss : undefined,
        markerType: config.markerType,
        markRuler: config.markRuler,
      };
      const id = `${key.markerType}|${key.cssColor}|${key.foreground ?? ''}|${key.markRuler}`;
      const group = groups.get(id) ?? { key, ranges: [] };
      group.ranges.push(
        new vscode.Range(document.positionAt(match.range.start), document.positionAt(match.range.end)),
      );
      groups.set(id, group);
    }

    this.decorations.apply(editor, groups);
  }

  clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) this.decorations.clear(editor);
  }

  forget(document: vscode.TextDocument): void {
    this.decorations.forget(document.uri.toString());
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.decorations.dispose();
  }
}
