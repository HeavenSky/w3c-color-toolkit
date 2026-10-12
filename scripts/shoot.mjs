// 功能截图: 在独立的 VS Code 实例里演示各功能并截图, 启动与截图的公共部分见 scripts/lib/shoot-ext.mjs.
// 用法: node scripts/shoot.mjs [输出目录, 默认 artifacts/shots] [--readme] [场景名过滤...]
//   highlight      颜色高亮与行内色块: 一个 CSS 文件里的多种颜色语法
//   hover          Hover 信息: 预览色块与各格式的取值
//   color-picker   行内色块打开的原生取色器
//   convert        Convert Color 的目标格式选择面板
//   variables      变量解析: var() 有多个候选定义时 Hover 列出全部候选
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, gitInit } from './lib/shoot-ext.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 设计令牌: --brand 唯一定义, --surface 随深浅色模式变化, 用来演示有多个候选的情形
const TOKENS_CSS = `:root {
  --brand: oklch(68% 0.19 42);
  --accent: #3b82f6;
  --channels: 148 163 184;
  --surface: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #0f172a;
  }
}
`;

const APP_CSS = `/* CSS Color 3 / 4 / 5 */
.badge {
  color: #e8590c;
  background: rgb(34 139 230 / 0.85);
  border-color: hsl(150deg 60% 45%);
  outline-color: rebeccapurple;
}

.button {
  color: var(--brand);
  background: color-mix(in oklch, var(--accent) 70%, white);
  border-color: rgb(var(--channels) / 0.4);
  caret-color: light-dark(#1e293b, #f1f5f9);
}

.panel {
  background: var(--surface);
}

.card {
  color: oklch(70% 0.2 30);
  background: lab(62% 48 -36);
  border-color: color(display-p3 0.2 0.8 0.4);
  box-shadow: 0 4px 12px hwb(220 10% 30% / 0.4);
}
`;

const h = await launch({
  repo: REPO, id: 'wct', port: 9337,
  setup(ws) {
    fs.mkdirSync(path.join(ws, 'styles'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'styles/tokens.css'), TOKENS_CSS);
    fs.writeFileSync(path.join(ws, 'styles/app.css'), APP_CSS);
    gitInit(ws);
  },
  // 关掉内置 CSS 服务的 MDN 说明, Hover 里只留本扩展的内容; 色块只在点击时打开取色器, 悬停颜色值时看到的是信息卡片
  settings: { 'css.hover.documentation': false, 'css.hover.references': false, 'editor.colorDecoratorsActivatedOn': 'click',
    // 点击色块时不高亮同名单词, 画面只留颜色相关的标记
    'editor.occurrencesHighlight': 'off', 'editor.selectionHighlight': false },
});
const { page } = h;
const editor = page.locator('#workbench\\.parts\\.editor');
const hoverWidget = page.locator('.monaco-hover:not(.hidden)').filter({ visible: true }).first();

/** 文本在编辑器里的屏幕位置(CSS 像素), 取第 nth 处出现; 只在单个渲染行内查找 */
async function textBox(text, nth = 0) {
  return page.evaluate(([t, n]) => {
    const lines = [...document.querySelectorAll('.editor-instance .view-lines .view-line')]
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    let seen = 0;
    for (const line of lines) {
      const s = line.textContent.replace(/ /g, ' ');
      const i = s.indexOf(t);
      if (i < 0 || seen++ < n) continue;
      // 逐个文本节点定位字符偏移
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let off = 0, start, end;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const len = node.textContent.length;
        if (!start && i < off + len) start = [node, i - off];
        if (i + t.length <= off + len) { end = [node, i + t.length - off]; break; }
        off += len;
      }
      const r = document.createRange();
      r.setStart(...start); r.setEnd(...end);
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return null;
  }, [text, nth]);
}

/** 鼠标悬停到文本中部并等待 Hover 出现 */
async function hoverText(text) {
  await page.mouse.move(5, 5);
  await h.sleep(300);
  const b = await textBox(text);
  if (!b) throw new Error(`编辑器里找不到 ${text}`);
  await page.mouse.move(b.x + Math.min(b.width / 2, 40), b.y + b.height / 2, { steps: 4 });
  await hoverWidget.waitFor({ timeout: 10000 });
  await h.sleep(1200);
  return b;
}

/**
 * 截图区域: 从编辑器左边缘(含行号)到弹层右边, 上下包住弹层与它所指的文本.
 * above 是文本上方多留的代码行数; 上下边缘对齐到行的边界, 不切到半行文字.
 */
async function regionAround(locator, anchor, { pad = 16, above = 0 } = {}) {
  const e = await editor.boundingBox();
  const b = await locator.boundingBox();
  const lineH = await page.evaluate(() => document.querySelector('.editor-instance .view-line').getBoundingClientRect().height);
  // 文本所在行的上边缘(文字框比行略矮, 居中放置)
  const lineTop = anchor.y - (lineH - anchor.height) / 2;
  let top = lineTop - above * lineH;
  while (top > b.y - pad) top -= lineH;
  top = Math.max(e.y, top - 4);
  const bottom = Math.max(b.y + b.height + pad, lineTop + lineH);
  return { x: e.x, y: top, width: Math.min(e.width, b.x + b.width + pad - e.x), height: bottom - top };
}

try {
  await h.openFile('app.css');
  await h.sleep(1500);

  if (h.want('highlight')) {
    await h.goto(1, 1);
    await h.shot('highlight', { clip: editor, pad: 0, maxHeight: 600 });
  }

  if (h.want('hover')) {
    await h.goto(1, 1);
    const b = await hoverText('oklch(70% 0.2 30)');
    await h.shot('hover', { clip: await regionAround(hoverWidget, b, { above: 20 }), keepMouse: true });
    await h.escape();
  }

  if (h.want('color-picker')) {
    await h.goto(1, 1);
    await page.mouse.move(5, 5);
    const b = await textBox('color(display-p3 0.2 0.8 0.4)');
    // 行内色块画在颜色值前面, 点它打开取色器
    const swatch = page.locator('.colorpicker-color-decoration').filter({ visible: true });
    let target = null;
    for (const s of await swatch.all()) {
      const sb = await s.boundingBox();
      if (sb && Math.abs(sb.y + sb.height / 2 - (b.y + b.height / 2)) < 6 && sb.x < b.x) target = s;
    }
    if (!target) throw new Error('没找到 color(display-p3) 前的行内色块');
    await target.click();
    const picker = page.locator('.colorpicker-widget').filter({ visible: true }).first();
    await picker.waitFor({ timeout: 10000 });
    await h.sleep(1200);
    await h.shot('color-picker', { clip: await regionAround(picker, b), keepMouse: true });
    await h.escape(2);
  }

  if (h.want('convert')) {
    await h.goto(21, 12);
    await h.command('W3C Color Toolkit: Convert Color', 1500);
    // 列表很长, 截到第二组(Perceptual)的最后一行为止, 不留半行
    const qi = page.locator('.quick-input-widget').filter({ visible: true }).first();
    const q = await qi.boundingBox();
    const row = await page.locator('.quick-input-widget .monaco-list-row').nth(7).boundingBox();
    await h.shot('convert', { clip: { x: q.x, y: q.y, width: q.width, height: row.y + row.height + 6 - q.y } });
    await h.escape();
  }

  if (h.want('variables')) {
    await h.goto(1, 1);
    const b = await hoverText('var(--surface)');
    await h.shot('variables', { clip: await regionAround(hoverWidget, b, { above: 3 }), keepMouse: true });
    await h.escape();
  }
} finally {
  await h.close();
}
