/**
 * Node 与 Web 共享的激活逻辑。
 *
 * 两个入口的唯一差异是注入的 `FileReader` 实现 (`imports-node` / `imports-web`),
 * 其余全部代码共用。
 */
import * as vscode from 'vscode';

import type { FileReader } from './adapters/types.js';
import { registerCommands, syncHdrContextKey } from './commands/register.js';
import { isLanguageEnabled } from './configuration/language-filter.js';
import { loadConfiguration, type RuntimeConfiguration } from './configuration/load.js';
import { CONFIG_SECTION } from './configuration/schema.js';
import { maybeNotifyCoexistence } from './features/coexistence/conflict-notice.js';
import { ConvertController } from './features/convert/convert-controller.js';
import { HighlightController } from './features/highlight/highlight-controller.js';
import { ColorHoverProvider } from './features/info/hover-provider.js';
import { ColorSwatchProvider } from './features/picker/color-provider.js';
import { DocumentIndexManager } from './index/document-index-manager.js';
import { Logger } from './logging/output-channel.js';

export interface ActivateOptions {
  /** Node 与 Web 分别注入; 目前两者都基于 `workspace.fs`。 */
  readonly createFileReader: () => FileReader;
  readonly hostKind: 'node' | 'web';
}

export function activateShared(
  context: vscode.ExtensionContext,
  options: ActivateOptions,
): void {
  const logger = new Logger();
  context.subscriptions.push(logger);

  let cached: RuntimeConfiguration | undefined;
  const configFor = (document?: vscode.TextDocument): RuntimeConfiguration => {
    // 按资源读取以支持 folder 级配置; 无文档时读全局。
    if (document) return loadConfiguration(document);
    if (!cached) cached = loadConfiguration();
    return cached;
  };

  const initial = configFor();
  logger.setLevel(initial.logLevel);
  logger.info(`activated on ${options.hostKind} extension host`);
  reportAdvancedIssues(initial, logger);

  const manager = new DocumentIndexManager((document) => configFor(document), logger);
  context.subscriptions.push(manager);

  const highlight = new HighlightController(manager, (document) => configFor(document));
  context.subscriptions.push(highlight);

  const convert = new ConvertController(
    manager,
    (document) => configFor(document),
    logger,
    context.workspaceState,
  );

  // FileReader 目前只在变量适配中使用; 保留注入以维持 Node/Web 边界显式。
  const fileReader = options.createFileReader();
  void fileReader;

  const hoverProvider = new ColorHoverProvider(manager, (document) => configFor(document));
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: '*', language: '*' }, hoverProvider),
  );

  // 行内色块与 Hover 取色器由 VS Code 渲染, 数据来自同一份索引。
  // 本扩展把 `editor.defaultColorDecorators` 的默认值改为 `never`
  // (见 contributes.configurationDefaults): 内置默认提供器认的 hex/rgb/hsl
  // 是本提供器的真子集, 关掉它可以让"一个颜色一个色块"成为确定行为。
  const swatchProvider = new ColorSwatchProvider(manager, (document) => configFor(document), logger);
  context.subscriptions.push(
    vscode.languages.registerColorProvider({ scheme: '*', language: '*' }, swatchProvider),
  );

  context.subscriptions.push(
    ...registerCommands({
      manager,
      highlight,
      convert,
      logger,
      getConfig: configFor,
    }),
  );

  void syncHdrContextKey(initial.cssColorHdr);

  // 文档事件
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!shouldTrack(event.document, configFor(event.document))) return;
      manager.scheduleRefresh(event.document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (!shouldTrack(document, configFor(document))) return;
      manager.scheduleRefresh(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      manager.releaseDocument(document);
      highlight.forget(document);
    }),
    // `contextualPreview: auto` 按当前主题选择 light-dark() 的分支, 因此换主题要重扫。
    vscode.window.onDidChangeActiveColorTheme(() => {
      cached = undefined;
      if (configFor().contextualPreview === 'off') return;
      manager.invalidateAll();
      highlight.clearAll();
      highlight.renderVisible();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) return;
      cached = undefined;
      const config = configFor();
      logger.setLevel(config.logLevel);
      manager.invalidateAll();
      reportAdvancedIssues(config, logger);
      await syncHdrContextKey(config.cssColorHdr);
      highlight.clearAll();
      highlight.renderVisible();
    }),
  );

  highlight.renderVisible();

  void maybeNotifyCoexistence(context.workspaceState, initial.coexistenceNotify);
}

function shouldTrack(document: vscode.TextDocument, config: RuntimeConfiguration): boolean {
  if (!config.enabled) return false;
  if (document.uri.scheme === 'output') return false;
  return isLanguageEnabled(config.languages, document.languageId);
}

function reportAdvancedIssues(config: RuntimeConfiguration, logger: Logger): void {
  for (const issue of config.advanced.issues) {
    const message = `advanced ${issue.kind}: ${issue.key} (${issue.scope})${
      issue.detail ? ` — ${issue.detail}` : ''
    }`;
    logger.warnOnce(`${issue.kind}:${issue.key}:${issue.scope}`, message);
  }
}

export function deactivateShared(): void {
  // 资源全部通过 context.subscriptions 释放; 这里保留钩子以便将来扩展。
}
