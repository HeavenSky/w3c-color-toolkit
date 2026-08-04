/**
 * Hover Provider。
 *
 * 优先使用共享索引; 索引尚未就绪时只对光标所在行做一次局部解析,
 * 随后由完整索引替换 (避免旧 Color Info 每次 Hover 都重扫当前行)。
 */
import * as vscode from 'vscode';

import { isLanguageEnabled } from '../../configuration/language-filter.js';
import type { RuntimeConfiguration } from '../../configuration/load.js';
import { scanText } from '../../core/scanner.js';
import type { ColorMatch } from '../../core/types.js';
import { scanOptionsFor, type DocumentIndexManager } from '../../index/document-index-manager.js';

import { renderHover } from './info-renderer.js';

export class ColorHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly manager: DocumentIndexManager,
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const config = this.getConfig(document);
    if (!config.enabled || !config.infoEnabled) return undefined;
    if (!isLanguageEnabled(config.languages, document.languageId)) return undefined;

    const offset = document.offsetAt(position);
    const match = this.findMatch(document, config, offset, position);
    if (!match) return undefined;

    const range = new vscode.Range(
      document.positionAt(match.range.start),
      document.positionAt(match.range.end),
    );
    return new vscode.Hover(renderHover(match, config), range);
  }

  private findMatch(
    document: vscode.TextDocument,
    config: RuntimeConfiguration,
    offset: number,
    position: vscode.Position,
  ): ColorMatch | undefined {
    const index = this.manager.indexOf(document);
    if (index?.current) {
      const found = index.findAtOffset(offset);
      if (found) return found;
      // 索引是最新的且没有命中, 说明光标处确实没有颜色。
      if (index.isFreshFor(document.version)) return undefined;
    }

    // 索引未就绪: 只解析当前行, 保证首次 Hover 也有结果。
    const line = document.lineAt(position.line);
    const lineOffset = document.offsetAt(line.range.start);
    const result = scanText(line.text, scanOptionsFor(config, document.languageId));
    const local = result.matches.find(
      (candidate) =>
        candidate.range.start + lineOffset <= offset && offset < candidate.range.end + lineOffset,
    );
    if (!local) return undefined;
    return {
      ...local,
      range: { start: local.range.start + lineOffset, end: local.range.end + lineOffset },
    };
  }
}
