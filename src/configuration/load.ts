/**
 * 从 VS Code 配置读出运行时配置对象。
 *
 * 这是 core 与 vscode API 的唯一配置接缝: core 只接受下面的纯数据结构,
 * 因此单元测试可以直接构造配置而不需要 vscode 环境。
 */
import * as vscode from 'vscode';

import type { MatchWords } from '../core/scanner.js';
import type { GamutMapping, HdrToneMapping, HexCase, RgbHslSyntax } from '../core/types.js';

import { resolveAdvanced, type AdvancedResolution } from './advanced.js';
import { ADVANCED_KEY, CONFIG_SECTION } from './schema.js';

export type MarkerType =
  | 'off'
  | 'background'
  | 'foreground'
  | 'outline'
  | 'underline'
  | 'dot-before'
  | 'dot-after';

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

export interface RuntimeConfiguration {
  readonly enabled: boolean;
  readonly languages: readonly string[];
  readonly markerType: MarkerType;
  readonly highlightEnabled: boolean;
  readonly infoEnabled: boolean;
  readonly convertSyntax: RgbHslSyntax;
  readonly precision: number;
  readonly cssColor6: boolean;
  readonly cssColorHdr: boolean;

  // 内置层
  readonly markRuler: boolean;
  readonly matchWords: MatchWords;
  readonly hexAlphaOrder: 'rgba' | 'argb';
  readonly matchRgbWithoutFunction: boolean;
  readonly rgbWithoutFunctionLanguages: readonly string[];
  readonly matchHslWithoutFunction: boolean;
  readonly hslWithoutFunctionLanguages: readonly string[];
  readonly maxMatchesPerDocument: number;
  readonly hdrToneMapping: HdrToneMapping;
  readonly infoFields: readonly string[] | null;
  readonly infoExcludedFields: readonly string[];
  readonly infoPreviewSize: 'small' | 'large';
  readonly infoPreviewShape: 'square' | 'rectangle';
  readonly infoShowDiagnostics: boolean;
  readonly infoShowSpecLevel: boolean;
  readonly convertEnabled: boolean;
  readonly alphaLoss: 'reject' | 'confirm' | 'drop';
  readonly missingComponentLoss: 'confirm' | 'compute';
  readonly namedColorFallback: 'reject' | 'nearest';
  readonly recentFirst: boolean;
  readonly gamutMapping: GamutMapping;
  readonly hexCase: HexCase;
  readonly scanComments: boolean;
  readonly scanStrings: boolean;
  readonly maxDocumentSizeKb: number;
  readonly contextualPreview: 'off' | 'light' | 'dark';
  readonly variablesResolve: boolean;
  readonly variablesIncludePaths: readonly string[];
  readonly maxImportDepth: number;
  readonly maxImportFiles: number;
  readonly maxResolveDepth: number;
  readonly hdrAssumedHeadroom: number;
  readonly coexistenceNotify: boolean;
  readonly logLevel: LogLevel;

  /** `advanced` 的解析结果, 供"显示生效配置"与告警使用。 */
  readonly advanced: AdvancedResolution;
}

function readAdvanced(scope: vscode.ConfigurationScope | undefined): AdvancedResolution {
  const inspected = vscode.workspace
    .getConfiguration(CONFIG_SECTION, scope)
    .inspect<Record<string, unknown>>(ADVANCED_KEY);
  return resolveAdvanced({
    user: inspected?.globalValue,
    workspace: inspected?.workspaceValue,
    folder: inspected?.workspaceFolderValue,
  });
}

/** 读取当前生效配置。`scope` 传入资源时可得到 folder 级配置。 */
export function loadConfiguration(scope?: vscode.ConfigurationScope): RuntimeConfiguration {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);
  const advanced = readAdvanced(scope);
  const get = <T>(key: string): T => advanced.values[key] as T;

  const markerType = config.get<MarkerType>('highlight', 'underline');
  const experimental = config.get<string[]>('experimental', ['cssColor6', 'cssColorHdr']);

  return {
    enabled: config.get<boolean>('enabled', true),
    languages: config.get<string[]>('languages', ['*']),
    markerType,
    highlightEnabled: markerType !== 'off',
    infoEnabled: config.get<boolean>('info', true),
    convertSyntax: config.get<RgbHslSyntax>('convertSyntax', 'legacy'),
    precision: config.get<number>('precision', 5),
    cssColor6: experimental.includes('cssColor6'),
    cssColorHdr: experimental.includes('cssColorHdr'),

    markRuler: get<boolean>('highlight.markRuler'),
    matchWords: get<MatchWords>('highlight.matchWords'),
    hexAlphaOrder: get<'rgba' | 'argb'>('highlight.hexAlphaOrder'),
    matchRgbWithoutFunction: get<boolean>('highlight.matchRgbWithoutFunction'),
    rgbWithoutFunctionLanguages: get<string[]>('highlight.rgbWithoutFunctionLanguages'),
    matchHslWithoutFunction: get<boolean>('highlight.matchHslWithoutFunction'),
    hslWithoutFunctionLanguages: get<string[]>('highlight.hslWithoutFunctionLanguages'),
    maxMatchesPerDocument: get<number>('highlight.maxMatchesPerDocument'),
    hdrToneMapping: get<HdrToneMapping>('highlight.hdrToneMapping'),
    infoFields: get<string[] | null>('info.fields'),
    infoExcludedFields: get<string[]>('info.excludedFields'),
    infoPreviewSize: get<'small' | 'large'>('info.previewSize'),
    infoPreviewShape: get<'square' | 'rectangle'>('info.previewShape'),
    infoShowDiagnostics: get<boolean>('info.showDiagnostics'),
    infoShowSpecLevel: get<boolean>('info.showSpecLevel'),
    convertEnabled: get<boolean>('convert.enabled'),
    alphaLoss: get<'reject' | 'confirm' | 'drop'>('convert.alphaLoss'),
    missingComponentLoss: get<'confirm' | 'compute'>('convert.missingComponentLoss'),
    namedColorFallback: get<'reject' | 'nearest'>('convert.namedColorFallback'),
    recentFirst: get<boolean>('convert.recentFirst'),
    gamutMapping: get<GamutMapping>('output.gamutMapping'),
    hexCase: get<HexCase>('output.hexCase'),
    scanComments: get<boolean>('scan.comments'),
    scanStrings: get<boolean>('scan.strings'),
    maxDocumentSizeKb: get<number>('scan.maxDocumentSizeKb'),
    contextualPreview: get<'off' | 'light' | 'dark'>('contextualPreview'),
    variablesResolve: get<boolean>('variables.resolve'),
    variablesIncludePaths: get<string[]>('variables.includePaths'),
    maxImportDepth: get<number>('variables.maxImportDepth'),
    maxImportFiles: get<number>('variables.maxImportFiles'),
    maxResolveDepth: get<number>('variables.maxResolveDepth'),
    hdrAssumedHeadroom: get<number>('experimental.hdrAssumedHeadroom'),
    coexistenceNotify: get<boolean>('coexistence.notify'),
    logLevel: get<LogLevel>('logLevel'),

    advanced,
  };
}

/** 配置摘要: 用于判断索引是否需要失效。 */
export function configurationDigest(config: RuntimeConfiguration): string {
  return JSON.stringify([
    config.enabled,
    config.languages,
    config.markerType,
    config.markRuler,
    config.infoEnabled,
    config.convertSyntax,
    config.precision,
    config.cssColor6,
    config.cssColorHdr,
    config.matchWords,
    config.scanComments,
    config.scanStrings,
    config.gamutMapping,
    config.hexCase,
    config.contextualPreview,
    config.hdrAssumedHeadroom,
    config.variablesResolve,
    config.maxMatchesPerDocument,
  ]);
}
