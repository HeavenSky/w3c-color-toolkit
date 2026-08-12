/**
 * 激活逻辑。由 `extension.ts` 调用, Node / Remote / Web 三种宿主共用。
 *
 * `StyleFileSource` 以注入方式传入而不是直接 import: 它是唯一与宿主能力相关的接缝
 * (glob 发现、读取、文件监听), 保留注入点让单元测试可以替换成内存实现。
 */
import * as vscode from 'vscode';

import type { StyleFileSource } from './adapters/types.js';
import { WorkspaceVariableIndex } from './adapters/workspace-variable-index.js';
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
import { isVariableLanguage } from './core/scanner.js';
import { ChangeCoalescer } from './index/change-coalescer.js';
import { DocumentIndexManager } from './index/document-index-manager.js';
import { Logger } from './logging/output-channel.js';

/** 变量上下文失效走单一合并键: 改哪个文件都只触发一次全局重扫。 */
const VARIABLE_CONTEXT_KEY = 'variable-context';

export interface ActivateOptions {
  /** 基于 `workspace.fs` 与 `findFiles` 的实现由 `extension.ts` 注入; 测试可替换。 */
  readonly createStyleFileSource: () => StyleFileSource;
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

  // 样式文件来源以注入方式传入: 它是唯一与宿主能力相关的接缝 (glob 发现、读取、监听),
  // 保留注入点让单元测试可以替换成内存实现。
  const variableIndex = new WorkspaceVariableIndex(options.createStyleFileSource(), {
    lookupGlobs: initial.variablesLookupGlobs,
    maxIndexedFiles: initial.maxIndexedFiles,
  });
  context.subscriptions.push({ dispose: () => variableIndex.dispose() });

  // 变量查表是同步的: 扫描期直接问符号表, 因此没有"先占位再异步补丁"的第二阶段。
  const manager = new DocumentIndexManager(
    (document) => configFor(document),
    logger,
    () => variableIndex.symbols(),
  );
  context.subscriptions.push(manager);

  // 符号表变化 (建索引完成、令牌文件被改) 时让全部文档失效; 单独一个合并窗口,
  // 避免一次批量文件事件触发多轮重扫。
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
      // 被编辑的可能是别的文件正在引用的令牌文件。用编辑器里的内容直接更新索引,
      // 因此定义不必等保存就生效; 外部改动 (切分支等) 由 watcher 与两个维护命令兜底。
      if (isVariableLanguage(event.document.languageId)) {
        variableIndex.upsert(
          event.document.uri.toString(),
          event.document.languageId,
          event.document.getText(),
        );
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

  // 索引变化 → 全量失效并重渲染。合并窗口是必须的: 一次 build 会触发多次通知,
  // 而 500KB 文件的一次扫描 p95 已达 7 秒。
  variableIndex.onDidChange(() => {
    variableContextCoalescer.schedule(VARIABLE_CONTEXT_KEY, () => {
      manager.bumpVariableContext();
      manager.invalidateAll();
      highlight.renderVisible();
    });
  });
  context.subscriptions.push({ dispose: variableIndex.startWatching() });

  // 建索引不阻塞激活: 就绪后靠上面的通知触发一次重扫。
  void variableIndex
    .build()
    .then(() => {
      const stats = variableIndex.stats;
      logger.info(
        `variable index ready: ${stats.files} files, ${stats.definitions} definitions`,
      );
      if (stats.truncated) {
        logger.warnOnce(
          'variable-index-truncated',
          `variable index stopped at ${initial.maxIndexedFiles} files; ` +
            'some definitions are not indexed (advanced.variables.maxIndexedFiles)',
        );
      }
      for (const uri of stats.failed) {
        logger.warnOnce(`variable-index-parse-failed:${uri}`, `stylesheet could not be parsed: ${uri}`);
      }
      for (const uri of stats.skipped) {
        logger.warnOnce(`variable-index-skipped:${uri}`, `stylesheet is too large to index: ${uri}`);
      }
    })
    .catch((error: unknown) => {
      logger.warnOnce('variable-index-failed', `variable index build failed: ${String(error)}`);
    });

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
