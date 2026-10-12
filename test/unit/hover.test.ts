/**
 * Hover 渲染的元信息行。
 *
 * `renderHover` 只用到 `MarkdownString` 与 `l10n.t`, 这里打桩这两个, 其余保持未定义以暴露意外依赖。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  MarkdownString: class {
    value = '';
    supportHtml = true;
    isTrusted = true;
    appendMarkdown(text: string) {
      this.value += text;
      return this;
    }
  },
  l10n: { t: (text: string) => text },
}));

import type { RuntimeConfiguration } from '../../src/configuration/load.js';
import type { ColorMatch } from '../../src/core/types.js';
import { RUNTIME_STRINGS } from '../../src/l10n/runtime-strings.js';

type RenderHover = typeof import('../../src/features/info/info-renderer.js')['renderHover'];

let renderHover: RenderHover;

beforeAll(async () => {
  ({ renderHover } = await import('../../src/features/info/info-renderer.js'));
});

const CONFIG = {
  fields: ['source', 'spec-level'],
  excludedFields: [],
  cssColorHdr: false,
  infoShowSpecLevel: true,
  infoShowDiagnostics: true,
  infoPreviewSize: 'small',
  infoPreviewShape: 'square',
  precision: 3,
  hexCase: 'lower',
  convertSyntax: 'modern',
  gamutMapping: 'css',
  hdrToneMapping: 'clip',
} as unknown as RuntimeConfiguration;

const SPEC_LABEL = `**${RUNTIME_STRINGS['field.spec-level']}**`;

function hoverOf(match: ColorMatch): string {
  return (renderHover(match, CONFIG) as unknown as { value: string }).value;
}

const AMBIGUOUS: ColorMatch = {
  raw: 'var(--surface)',
  range: { start: 0, end: 14 },
  syntax: 'css-variable',
  experimental: false,
  resolution: 'contextual',
  contextual: {
    reason: 'css-variable',
    dependsOn: '--surface',
    branches: [
      { label: ':root', raw: '#ffffff' },
      { label: '@media (prefers-color-scheme: dark) › :root', raw: '#000000' },
    ],
  },
  diagnostics: [],
};

describe('Hover 的 Specification 行', () => {
  it('没有规范层级的 match 不显示这一行', () => {
    const value = hoverOf(AMBIGUOUS);
    expect(value).toContain('`#ffffff`');
    expect(value).not.toContain(SPEC_LABEL);
  });

  it('有规范层级时照常显示', () => {
    const value = hoverOf({ ...AMBIGUOUS, specLevel: 'color-3' });
    expect(value).toContain(`${SPEC_LABEL}: ${RUNTIME_STRINGS['spec.color-3']}`);
  });
});
