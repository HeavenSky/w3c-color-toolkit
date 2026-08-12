/**
 * 激活逻辑。由 `extension.ts` 调用, Node / Remote / Web 三种宿主共用。
 *
 * `FileReader` 仍以注入方式传入而不是直接 import: 它是唯一与宿主能力相关的接缝,
 * 保留注入点让单元测试可以替换成内存实现。
 */
import * as vscode from 'vscode';

import type { FileReader } from './adapters/types.js';
import { registerCommands, syncHdrContextKey } from './commands/register.js';
import { invalidPatterns } from './configuration/disable-filter.js';
import { disableRulesOf, isDocumentHidden } from './configuration/disable-gate.js';
import { loadConfiguration, type RuntimeConfiguration } from './configuration/load.js';
import { CONFIG_SECTION } from './configuration/schema.js';
import { maybeNotifyCoexistence } from './features/coexistence/conflict-notice.js';
import { ConvertController } from './features/convert/convert-controller.js';
import { HighlightController } from './features/highlight/highlight-controller.js';
import { ColorHoverProvider } from './features/info/hover-provider.js';
import { ColorSwatchProvider } from './features/picker/color-provider.js';
import { isCssLikeLanguage } from './core/scanner.js';
import { ChangeCoalescer } from './index/change-coalescer.js';
import { DocumentIndexManager } from './index/document-index-manager.js';
import { Logger } from './logging/output-channel.js';

/** 变量上下文失效走单一合并键: 改哪个文件都只触发一次全局重扫。 */
const VARIABLE_CONTEXT_KEY = 'variable-context';

export interface ActivateOptions {
  /** 基于 `workspace.fs` 的实现由 `extension.ts` 注入; 测试可替换。 */
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

  // FileReader 以注入方式传入: 它是唯一与宿主能力相关的接缝, 保留注入点让单元测试
  // 可以替换成内存实现。变量解析的跨文件读取全部经由它。
  const fileReader = options.createFileReader();

  const manager = new DocumentIndexManager((document) => configFor(document), logger, fileReader);
  context.subscriptions.push(manager);

  // 变量文件被编辑时要让引用它的其他文档也重扫; 单独一个合并窗口, 不借用管理器的私有实例。
  const variableContextCoalescer = new ChangeCoalescer();
  context.subscriptions.push(variableContextCoalescer);

  const highlight = new HighlightController(manager, (document) => configFor(document));
  context.subscriptions.push(highlight);

  const convert = new ConvertController(
    manager,
    (document) => configFor(document),
    logger,
    context.workspaceState,
  );

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
      if (!shouldTrack(event.document, configFor(event.document))) {
        // 文档可能是刚刚被编辑到超过大小阈值才转为隐身的; 直接 return 会把此前渲染的
        // 装饰留在屏幕上, 因为之后再没有任何事件会驱动这个文档重渲染。
        highlight.renderDocument(event.document);
        return;
      }
      manager.scheduleRefresh(event.document);
      // 被编辑的可能是别的文件正在引用的变量文件。这里只处理已打开的文件:
      // 外部改动 (切分支等) 由"重扫当前文档"与"清除索引缓存"两个命令兜底。
      if (isCssLikeLanguage(event.document.languageId)) {
        // 必须合并: 直接在事件里重扫全部可见文档等于每次按键重扫一遍,
        // 而 500KB 文件的一次扫描 p95 已达 7 秒。
        variableContextCoalescer.schedule(VARIABLE_CONTEXT_KEY, () => {
          manager.bumpVariableContext();
          manager.invalidateAll();
          highlight.renderVisible();
        });
      }
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
  return !isDocumentHidden(document, config);
}

function reportAdvancedIssues(config: RuntimeConfiguration, logger: Logger): void {
  for (const issue of config.advanced.issues) {
    const message = `advanced ${issue.kind}: ${issue.key} (${issue.scope})${
      issue.detail ? ` — ${issue.detail}` : ''
    }`;
    logger.warnOnce(`${issue.kind}:${issue.key}:${issue.scope}`, message);
  }

  // 无效的禁用模式是配置级问题, 与具体文档无关, 因此和上面的 advanced 告警同源上报:
  // 放在 `ensure()` 里会因隐身早退而漏报一部分情况。
  for (const pattern of invalidPatterns(disableRulesOf(config))) {
    logger.warnOnce(
      `invalid-pattern:${pattern}`,
      `disable pattern is ignored because it contains "/" or is empty: ${pattern}`,
    );
  }
}

export function deactivateShared(): void {
  // 资源全部通过 context.subscriptions 释放; 这里保留钩子以便将来扩展。
}
