/**
 * 功能可用性冒烟检查 (不依赖 VS Code 运行时)。
 *
 * 覆盖真实调用链: 扫描 → 解析 → 求值 → 色域映射 → 序列化,
 * 以及 Hover 字段计算与转换预览的纯逻辑部分。
 * 需要 vscode API 的部分 (装饰、Quick Pick、命令) 由集成测试覆盖。
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;

const dir = await mkdtemp(join(tmpdir(), 'w3c-color-toolkit-smoke-'));
const outfile = join(dir, 'smoke.mjs');
await build({
  entryPoints: [join(ROOT, 'scripts/smoke-entry.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const api = await import(pathToFileURL(outfile).href);
await rm(dir, { recursive: true, force: true });

const {
  scanText,
  serialize,
  fieldValue,
  resolveHighlightSyntaxes,
  resolveHoverFields,
  previewConversion,
  convertSource,
  computePreviewColor,
  previewSource,
  advancedDefaults,
  resolveAdvanced,
  isLanguageEnabled,
  renderSupportMatrixRows,
} = api;

const SCAN = {
  cssColor6: true,
  cssColorHdr: true,
  contextualPreview: 'light',
  hdrAssumedHeadroom: 0,
  matchWords: 'css-like',
  cssLikeLanguage: true,
  scanComments: true,
  scanStrings: true,
  maxMatches: 10000,
};

const SERIALIZE = {
  precision: 5,
  hexCase: 'lower',
  syntax: 'legacy',
  gamutMapping: 'css',
  computeMissingComponents: false,
};

const SAMPLE = `:root {
  --brand: #ff8800;
  color: rgb(255, 136, 0);
  background: oklch(0.7 0.2 40deg);
  border-color: color(display-p3 1 0.5 0);
  outline-color: color-mix(in oklch, red 20%, blue 30%, green 50%);
  accent-color: oklch(from red calc(l * 0.5) c h);
  caret-color: alpha(from red / 0.5);
  text-decoration-color: device-cmyk(0 0.5 1 0);
  column-rule-color: light-dark(white, black);
  fill: currentColor;
  stroke: Canvas;
  flood-color: Menu;
  stop-color: ictcp(0.5 0 0);
  lighting-color: color(rec2100-pq 0.5 0.5 0.5);
  --layers: color-layers(rgb(255 0 0 / 0.5), blue);
  --contrast: contrast-color(white wcag2(aaa), black, #eeeeee);
  --missing: oklch(0.7 none 40);
  /* comment color: #123456 */
  content: "string color #abcdef";
  dynamic-range-limit: standard;
}`;

let failures = 0;
function check(label, condition, detail = '') {
  const status = condition ? 'ok  ' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${status} ${label}${detail ? ` — ${detail}` : ''}`);
}

// ── 1. 扫描 ────────────────────────────────────────────────────
const { matches, truncated } = scanText(SAMPLE, SCAN);
// 同一 syntax 可能出现多次 (例如文档里有多个 hex), 取第一个以获得稳定的断言目标。
const bySyntax = new Map();
for (const match of matches) if (!bySyntax.has(match.syntax)) bySyntax.set(match.syntax, match);

console.log(`\n=== 扫描 (${matches.length} 个 match, truncated=${truncated}) ===`);
for (const match of matches) {
  const slice = SAMPLE.slice(match.range.start, match.range.end);
  if (slice !== match.raw) {
    check(`raw 与 range 一致: ${match.raw}`, false, `切片得到 ${slice}`);
  }
}
check('raw 与 range 全部一致 (§7.2 约束)', matches.every((m) => SAMPLE.slice(m.range.start, m.range.end) === m.raw));

for (const syntax of [
  'hex',
  'legacy-rgb',
  'oklch',
  'color-display-p3',
  'color-mix-variadic',
  'relative-oklch',
  'alpha',
  'device-cmyk',
  'light-dark',
  'current-color',
  'system-color',
  'deprecated-system-color',
  'ictcp',
  'color-rec2100-pq',
  'color-layers',
  'contrast-color-ext',
]) {
  check(`识别 ${syntax}`, bySyntax.has(syntax), bySyntax.get(syntax)?.raw ?? '未命中');
}
check('注释中的颜色被识别', matches.some((m) => m.raw === '#123456'));
check('字符串中的颜色被识别', matches.some((m) => m.raw === '#abcdef'));
check(
  'dynamic-range-limit 的 standard 未被误判为颜色',
  !matches.some((m) => m.raw === 'standard'),
);
check('属性名未被误判为颜色', !matches.some((m) => m.raw === 'background' || m.raw === 'color'));

// ── 2. 解析状态 ────────────────────────────────────────────────
console.log('\n=== 解析状态 ===');
check('currentColor 为 contextual', bySyntax.get('current-color')?.resolution === 'contextual');
check('系统色 Canvas 为 contextual', bySyntax.get('system-color')?.resolution === 'contextual');
check(
  'deprecated 系统色给出替代关键字',
  bySyntax.get('deprecated-system-color')?.contextual?.replacement === 'Canvas',
);
check(
  'light-dark 在 contextualPreview=light 下有假设值',
  bySyntax.get('light-dark')?.contextual?.assumed?.context === 'light',
);
check('device-cmyk 标记近似', bySyntax.get('device-cmyk')?.resolved?.approximate === true);
check('HDR 语法标记为实验', bySyntax.get('ictcp')?.experimental === true);
check('missing component 被记录', matches.some((m) => (m.resolved?.missingComponents.length ?? 0) > 0));

// ── 3. 序列化与转换 ────────────────────────────────────────────
console.log('\n=== 序列化 ===');
const hexMatch = bySyntax.get('hex');
for (const target of ['hex', 'rgb', 'hsl', 'oklch', 'color-display-p3', 'named-color']) {
  const result = serialize(hexMatch.resolved, target, SERIALIZE);
  console.log(`     ${target.padEnd(20)} → ${result.text}`);
}
check('hex 输出 6 位', serialize(hexMatch.resolved, 'hex', SERIALIZE).text === '#ff8800');
// SERIALIZE 使用当前默认的 legacy 风格, 两种风格各自显式断言。
check(
  'legacy rgb 使用逗号 (当前默认)',
  serialize(hexMatch.resolved, 'rgb', SERIALIZE).text === 'rgb(255, 136, 0)',
);
check(
  'modern rgb 使用空格',
  serialize(hexMatch.resolved, 'rgb', { ...SERIALIZE, syntax: 'modern' }).text === 'rgb(255 136 0)',
);
const p3 = bySyntax.get('color-display-p3');
check('广色域转 hex 时标记色域映射', serialize(p3.resolved, 'hex', SERIALIZE).gamutMapped === true);

console.log('\n=== 转换策略 ===');
const policy = {
  alphaLoss: 'reject',
  missingComponentLoss: 'confirm',
  namedColorFallback: 'reject',
  allowAssumedContextual: false,
};
check(
  'contextual 值默认拒绝转换',
  'rejection' in convertSource(bySyntax.get('current-color'), policy),
);
check(
  '显式允许后可按假设值转换',
  'resolved' in convertSource(bySyntax.get('light-dark'), { ...policy, allowAssumedContextual: true }),
);
const layers = bySyntax.get('color-layers');
check(
  '半透明色转颜色名被拒绝 (alpha 无法表达)',
  'rejection' in previewConversion(layers.resolved, 'named-color', SERIALIZE, policy),
);
check(
  'missing component 跨空间需要确认',
  (() => {
    const missing = matches.find((m) => (m.resolved?.missingComponents.length ?? 0) > 0);
    const preview = previewConversion(missing.resolved, 'hex', SERIALIZE, policy);
    return !('rejection' in preview) && preview.needsConfirmation.includes('missing-component-loss');
  })(),
);

// ── 4. 颜色字段 (Hover 行 + 高亮语法) ──────────────────────────
console.log('\n=== 颜色字段 ===');
const fields = resolveHoverFields(null, [], true);
check('默认 Hover 字段 30 项 (HDR 开启)', fields.length === 30, fields.join(', '));
for (const field of ['hex', 'rgb', 'hsl', 'oklch', 'display-p3', 'alpha', 'gamut']) {
  const value = fieldValue(field, hexMatch.resolved, SERIALIZE);
  console.log(`     ${field.padEnd(14)} → ${value}`);
  check(`字段 ${field} 有值`, value !== undefined);
}
check('fields.excluded 优先于 fields.enabled', !resolveHoverFields(['hex', 'rgb'], ['hex'], false).includes('hex'));
check('默认排除 alpha / gamut / contrast', ['alpha','gamut','contrast-on-white','contrast-on-black'].every((f) => !fields.includes(f)));
check('HDR 字段仅在开关开启时渲染', !resolveHoverFields(null, [], false).includes('ictcp') && resolveHoverFields(null, [], true).includes('ictcp'));
check('只读语法不进入 Hover 字段', !fields.includes('light-dark') && !fields.includes('color-mix'));

const allSyntaxes = resolveHighlightSyntaxes(null, [], true);
check(
  '默认高亮覆盖全部已登记语法',
  ['hex', 'srgb', 'legacy-rgb', 'hsl', 'oklch', 'color-display-p3', 'color-mix', 'relative-hsl', 'alpha', 'light-dark', 'system-color', 'device-cmyk', 'ictcp', 'hdr-color', 'named-color', 'transparent'].every((s) => allSyntaxes.allows(s)),
);
check('未登记语法默认放行', allSyntaxes.allows('some-future-syntax'));
const withoutRelative = resolveHighlightSyntaxes(null, ['relative-color', 'light-dark'], true);
check(
  '关闭字段同时收窄高亮',
  !withoutRelative.allows('relative-hsl') && !withoutRelative.allows('light-dark') && withoutRelative.allows('hex'),
);
check('HDR 语法随开关关闭', !resolveHighlightSyntaxes(null, [], false).allows('ictcp'));

// ── 5. 预览色 ──────────────────────────────────────────────────
console.log('\n=== 预览色 ===');
const preview = computePreviewColor(hexMatch.resolved, 'css', 'reinhard');
console.log(`     #ff8800 → ${preview.css} / 前景 ${preview.foregroundCss}`);
check('预览色是安全的 rgba 形式', /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(preview.css));
check('背景模式有前景色', preview.foregroundCss.startsWith('rgba('));
// 只有真正超出 sRGB 亮度范围的 HDR 值才会被色调映射并置标记;
// rec2100-pq 0.5 的亮度低于 1, 因此不应被标记。
const dimHdr = computePreviewColor(bySyntax.get('color-rec2100-pq').resolved, 'css', 'reinhard');
check('未超范围的 HDR 值不虚报色调映射', dimHdr.hdrToneMapped === false);
const brightHdr = scanText('a { color: color(rec2100-pq 1 1 1); }', SCAN).matches[0];
const brightPreview = computePreviewColor(brightHdr.resolved, 'css', 'reinhard');
check('超范围 HDR 值被色调映射并置标记', brightPreview.hdrToneMapped === true);
check('contextual 无预览源', previewSource(bySyntax.get('current-color')) === undefined);

// ── 6. 配置 ────────────────────────────────────────────────────
console.log('\n=== 配置 ===');
check('内置层 35 项默认值', Object.keys(advancedDefaults()).length === 35);
const resolvedAdvanced = resolveAdvanced({
  user: { 'output.hexCase': 'upper' },
  workspace: { 'scan.comments': false, precision: 3, 'bogus.key': 1 },
});
check('advanced 跨 scope 逐键合并', resolvedAdvanced.values['output.hexCase'] === 'upper');
check('工作区键生效', resolvedAdvanced.values['scan.comments'] === false);
check('暴露层键被拒绝', resolvedAdvanced.issues.some((i) => i.kind === 'exposed-key'));
check('未知键被忽略', resolvedAdvanced.issues.some((i) => i.kind === 'unknown-key'));
check('语言过滤: 排除项优先', isLanguageEnabled(['*', '!plaintext'], 'plaintext') === false);

// ── 7. 支持矩阵 ────────────────────────────────────────────────
const rows = renderSupportMatrixRows();
check('支持矩阵有内容', rows.includes('规范支持矩阵'), `${rows.split('\n').length} 行`);

console.log(`\n${failures === 0 ? '全部冒烟检查通过' : `${failures} 项冒烟检查失败`}`);
process.exit(failures === 0 ? 0 : 1);
