/**
 * Hover 内容渲染。
 *
 * 安全要求: 预览 SVG 使用本地 data URI, 绝不把 raw color 拼入 SVG,
 * 只使用序列化后的安全数值; alpha 用棋盘背景表示。
 * contextual 值显示原因、候选分支与建议, 不显示伪造色块。
 */
import * as vscode from 'vscode';

import type { RuntimeConfiguration } from '../../configuration/load.js';
import type { ColorMatch, SerializerOptions } from '../../core/types.js';
import { renderContextualReason, renderDiagnostic, renderSpecLevel, t } from '../../l10n/strings.js';
import { computePreviewColor, previewSource } from '../highlight/preview-color.js';

import { fieldValue, resolveFieldOrder, type FieldId } from './fields.js';

/** 只允许 `rgba(int, int, int, number)`; 其他形式一律拒绝, 防止注入。 */
const SAFE_RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/;

export function isSafeCssColor(value: string): boolean {
  return SAFE_RGBA.test(value);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface PreviewSvgOptions {
  readonly size: 'small' | 'large';
  readonly shape: 'square' | 'rectangle';
}

/** 生成预览 SVG 的 data URI。 */
export function previewSvgDataUri(cssColor: string, options: PreviewSvgOptions): string | undefined {
  if (!isSafeCssColor(cssColor)) return undefined;
  const height = options.size === 'large' ? 24 : 14;
  const width = options.shape === 'square' ? height : height * 3;
  const checker = Math.max(4, Math.floor(height / 3));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<defs><pattern id="c" width="${checker * 2}" height="${checker * 2}" patternUnits="userSpaceOnUse">`,
    `<rect width="${checker * 2}" height="${checker * 2}" fill="#ffffff"/>`,
    `<rect width="${checker}" height="${checker}" fill="#cccccc"/>`,
    `<rect x="${checker}" y="${checker}" width="${checker}" height="${checker}" fill="#cccccc"/>`,
    `</pattern></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#c)"/>`,
    `<rect width="${width}" height="${height}" fill="${escapeXml(cssColor)}"/>`,
    `<rect width="${width}" height="${height}" fill="none" stroke="#00000033"/>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function serializerOptionsOf(config: RuntimeConfiguration): SerializerOptions {
  return {
    precision: config.precision,
    hexCase: config.hexCase,
    syntax: config.convertSyntax,
    gamutMapping: config.gamutMapping,
    computeMissingComponents: false,
  };
}

function fieldLabel(field: FieldId): string {
  return t(`field.${field}` as Parameters<typeof t>[0]);
}

/** 渲染一个 match 的 Hover Markdown。 */
export function renderHover(match: ColorMatch, config: RuntimeConfiguration): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  markdown.isTrusted = false;

  const options = serializerOptionsOf(config);
  const fields = resolveFieldOrder(config.infoFields, config.infoExcludedFields, config.cssColorHdr);
  const resolved = previewSource(match);

  const lines: string[] = [];

  for (const field of fields) {
    if (field === 'preview') {
      if (!resolved) continue;
      const preview = computePreviewColor(resolved, config.gamutMapping, config.hdrToneMapping);
      const uri = previewSvgDataUri(preview.css, {
        size: config.infoPreviewSize,
        shape: config.infoPreviewShape,
      });
      if (uri) lines.push(`![${t('field.preview')}](${uri})`);
      continue;
    }

    if (field === 'source') {
      lines.push(`**${fieldLabel('source')}**: \`${match.raw}\``);
      continue;
    }

    if (field === 'spec-level') {
      if (!config.infoShowSpecLevel) continue;
      lines.push(`**${fieldLabel('spec-level')}**: ${renderSpecLevel(match.specLevel)}`);
      continue;
    }

    if (field === 'diagnostics') {
      if (!config.infoShowDiagnostics || match.diagnostics.length === 0) continue;
      for (const diagnostic of match.diagnostics) {
        lines.push(`- ${renderDiagnostic(diagnostic)}`);
      }
      continue;
    }

    if (!resolved) continue;
    const value = fieldValue(field, resolved, options);
    if (value === undefined) continue;
    lines.push(`**${fieldLabel(field)}**: \`${value}\``);
  }

  // contextual: 显示原因与候选分支, 不显示伪造色块。
  if (match.resolution === 'contextual' && match.contextual) {
    const contextual = match.contextual;
    lines.unshift(
      `**${match.raw}** — ${renderContextualReason(
        contextual.reason,
        contextual.replacement ?? contextual.dependsOn,
      )}`,
    );
    for (const branch of contextual.branches) {
      const suffix = branch.resolved ? '' : ` (${t('ui.unknown')})`;
      lines.push(`- \`${branch.label}\`: \`${branch.raw}\`${suffix}`);
    }
    if (contextual.assumed) {
      lines.push(`- ${t('ui.assumedValue')}: \`${contextual.assumed.context}\``);
    }
  }

  if (resolved?.approximate) lines.push(`- ${t('ui.approximate')}`);
  if (resolved?.hdrToneMapped) lines.push(`- ${t('ui.hdrToneMapped')}`);

  if (match.resolution === 'invalid') {
    for (const diagnostic of match.diagnostics) lines.push(`- ${renderDiagnostic(diagnostic)}`);
  }

  markdown.appendMarkdown(lines.join('\n\n'));
  return markdown;
}
