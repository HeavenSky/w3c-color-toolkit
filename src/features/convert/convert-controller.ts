/**
 * 转换控制器。
 *
 * 关键行为:
 * - 支持多选区; 空选区时使用光标所在的索引 match;
 * - 非空选区必须完整构成单个颜色表达式;
 * - 先解析全部选区, 全部成功后执行一次 `TextEditor.edit()`;
 *   任一失败则不写入任何内容并列出失败选区;
 * - contextual 只有在用户显式配置预览上下文并确认后才能转换。
 */
import * as vscode from 'vscode';

import type { RuntimeConfiguration } from '../../configuration/load.js';
import type { TargetFormat } from '../../core/serializer.js';
import type { ColorMatch, SerializerOptions } from '../../core/types.js';
import type { DocumentIndexManager } from '../../index/document-index-manager.js';
import { t } from '../../l10n/strings.js';
import type { Logger } from '../../logging/output-channel.js';

import { createRecentStore, pickTargetFormat, type RecentStore } from './format-picker.js';
import {
  convertSource,
  isRejection,
  previewConversion,
  type ConvertPolicy,
  type ConvertRejection,
} from './presentations.js';

interface PlannedEdit {
  readonly range: vscode.Range;
  readonly text: string;
}

interface FailedSelection {
  readonly line: number;
  readonly rejection: ConvertRejection;
}

export class ConvertController {
  private readonly recent: RecentStore;

  constructor(
    private readonly manager: DocumentIndexManager,
    private readonly getConfig: (document: vscode.TextDocument) => RuntimeConfiguration,
    private readonly logger: Logger,
    memento: vscode.Memento,
  ) {
    this.recent = createRecentStore(memento);
  }

  private serializerOptions(config: RuntimeConfiguration): SerializerOptions {
    return {
      precision: config.precision,
      hexCase: config.hexCase,
      syntax: config.convertSyntax,
      gamutMapping: config.gamutMapping,
      computeMissingComponents: config.missingComponentLoss === 'compute',
    };
  }

  private policy(config: RuntimeConfiguration, allowAssumedContextual: boolean): ConvertPolicy {
    return {
      alphaLoss: config.alphaLoss,
      missingComponentLoss: config.missingComponentLoss,
      namedColorFallback: config.namedColorFallback,
      allowAssumedContextual,
    };
  }

  /** 收集当前编辑器需要处理的 match。 */
  private collectMatches(
    editor: vscode.TextEditor,
  ): { readonly matches: readonly { match: ColorMatch; range: vscode.Range }[] } {
    const document = editor.document;
    this.manager.ensure(document);
    const index = this.manager.indexOf(document);
    const out: { match: ColorMatch; range: vscode.Range }[] = [];

    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        const match = index?.findAtOffset(document.offsetAt(selection.active));
        if (match) {
          out.push({
            match,
            range: new vscode.Range(
              document.positionAt(match.range.start),
              document.positionAt(match.range.end),
            ),
          });
        }
        continue;
      }

      const start = document.offsetAt(selection.start);
      const end = document.offsetAt(selection.end);
      const inside = index?.findInRange(start, end) ?? [];
      // 非空选区必须完整构成单个颜色表达式。
      const exact = inside.find((match) => match.range.start === start && match.range.end === end);
      if (exact) {
        out.push({ match: exact, range: new vscode.Range(selection.start, selection.end) });
      } else {
        out.push({
          match: {
            raw: document.getText(selection),
            range: { start, end },
            syntax: 'selection',
            specLevel: 'color-4',
            experimental: false,
            resolution: 'invalid',
            diagnostics: [],
          },
          range: new vscode.Range(selection.start, selection.end),
        });
      }
    }
    return { matches: out };
  }

  /** Quick Pick 入口。 */
  async convertWithPicker(editor: vscode.TextEditor, copyOnly = false): Promise<void> {
    const config = this.getConfig(editor.document);
    if (!config.convertEnabled) return;

    const { matches } = this.collectMatches(editor);
    if (matches.length === 0) {
      void vscode.window.showInformationMessage(t('ui.noColorAtCursor'));
      return;
    }

    const first = matches[0];
    const source = convertSource(first.match, this.policy(config, false));
    if ('rejection' in source) {
      this.reportRejections([{ line: first.range.start.line, rejection: source.rejection }]);
      return;
    }

    const target = await pickTargetFormat({
      titleKey: copyOnly ? 'quickPick.copyTitle' : 'quickPick.convertTitle',
      resolved: source.resolved,
      serializerOptions: this.serializerOptions(config),
      policy: this.policy(config, false),
      config,
      recent: this.recent,
      currentText: first.match.raw,
    });
    if (!target) return;

    await this.recent.push(target);
    if (copyOnly) await this.copy(editor, target);
    else await this.convertTo(editor, target);
  }

  /** 直达命令入口。 */
  async convertTo(editor: vscode.TextEditor, target: TargetFormat): Promise<void> {
    const config = this.getConfig(editor.document);
    if (!config.convertEnabled) return;

    const { matches } = this.collectMatches(editor);
    if (matches.length === 0) {
      void vscode.window.showInformationMessage(t('ui.noColorAtCursor'));
      return;
    }

    const options = this.serializerOptions(config);
    const edits: PlannedEdit[] = [];
    const failures: FailedSelection[] = [];
    const confirmations = new Set<'alpha-loss' | 'missing-component-loss'>();

    for (const entry of matches) {
      const source = convertSource(entry.match, this.policy(config, false));
      if ('rejection' in source) {
        failures.push({ line: entry.range.start.line, rejection: source.rejection });
        continue;
      }
      const preview = previewConversion(source.resolved, target, options, this.policy(config, false));
      if (isRejection(preview)) {
        failures.push({ line: entry.range.start.line, rejection: preview.rejection });
        continue;
      }
      for (const item of preview.needsConfirmation) confirmations.add(item);
      edits.push({ range: entry.range, text: preview.serialized.text });
    }

    // 任一失败时不执行部分写入。
    if (failures.length > 0) {
      this.reportRejections(failures);
      return;
    }

    if (confirmations.size > 0 && !(await this.confirm(confirmations))) return;

    await editor.edit((builder) => {
      for (const edit of edits) builder.replace(edit.range, edit.text);
    });
  }

  /** 复制到剪贴板, 不修改文档。 */
  async copy(editor: vscode.TextEditor, target: TargetFormat): Promise<void> {
    const config = this.getConfig(editor.document);
    const { matches } = this.collectMatches(editor);
    if (matches.length === 0) {
      void vscode.window.showInformationMessage(t('ui.noColorAtCursor'));
      return;
    }
    const options = this.serializerOptions(config);
    const texts: string[] = [];
    for (const entry of matches) {
      const source = convertSource(entry.match, this.policy(config, false));
      if ('rejection' in source) continue;
      const preview = previewConversion(source.resolved, target, options, this.policy(config, false));
      if (isRejection(preview)) continue;
      texts.push(preview.serialized.text);
    }
    if (texts.length === 0) {
      void vscode.window.showInformationMessage(t('convert.rejectedInvalid'));
      return;
    }
    await vscode.env.clipboard.writeText(texts.join('\n'));
    void vscode.window.showInformationMessage(t('ui.copied', texts.join(', ')));
  }

  private async confirm(items: ReadonlySet<'alpha-loss' | 'missing-component-loss'>): Promise<boolean> {
    const messages: string[] = [];
    if (items.has('alpha-loss')) messages.push(t('convert.confirmAlphaLoss'));
    if (items.has('missing-component-loss')) messages.push(t('convert.confirmMissingComponents'));
    const answer = await vscode.window.showWarningMessage(
      messages.join(' '),
      { modal: true },
      t('convert.yes'),
    );
    return answer === t('convert.yes');
  }

  private reportRejections(failures: readonly FailedSelection[]): void {
    const details = failures.map((failure) => {
      const line = failure.line + 1;
      switch (failure.rejection.kind) {
        case 'contextual':
          return `${line}: ${t('convert.rejectedContextual', failure.rejection.detail)}`;
        case 'alpha-loss':
          return `${line}: ${t('convert.rejectedAlphaLoss', failure.rejection.target)}`;
        case 'named-color-no-exact-match':
          return `${line}: ${t('convert.rejectedNamedColor')}`;
        default:
          return `${line}: ${t('convert.rejectedInvalid')}`;
      }
    });
    this.logger.report('convert', details);
    void vscode.window.showWarningMessage(t('convert.failedSelections', details.join('; ')));
  }
}
