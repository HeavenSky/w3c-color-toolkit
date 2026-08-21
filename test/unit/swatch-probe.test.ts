/**
 * 色块探测的范围, 键与缓存策略。
 *
 * 缓存那三条规则是一次真实缺陷的回归: 空探测结果被缓存后, "没人覆盖"会被钉死到文档下一次
 * 改动为止, 于是本扩展与内置 CSS 提供器同时上报, 同一个颜色出现两个色块, 而探测本身
 * 没有失败, 所以输出面板里一条日志都没有。
 *
 * 探测范围与覆盖键同样来自真实缺陷: 探测语言写死成 css/less/scss 时, HTML 的 `<style>`
 * 里每个颜色都有两个色块 (内置 HTML 语言服务也接管内嵌 CSS); 覆盖键只按精确 range 比对时,
 * 内置 JSON 提供器上报的带引号 range 与本扩展的引号内 range 永远对不上。
 */
import { describe, expect, it } from 'vitest';

import {
  PROBE_CACHE_LIMIT,
  builtInColorLanguages,
  coverageKeys,
  readProbeCache,
  shouldCacheProbe,
  writeProbeCache,
  type ProbeEntry,
} from '../../src/features/picker/swatch-plan.js';

const CSS_EXTENSION = 'vscode.css-language-features';
const HTML_EXTENSION = 'vscode.html-language-features';
const JSON_EXTENSION = 'vscode.json-language-features';

const entry = (version: number, ranges: readonly string[] = []): ProbeEntry => ({
  version,
  covered: new Set(ranges),
});

describe('要探测哪些语言', () => {
  it('三个内置语言服务的基础语言各自归属自己的扩展', () => {
    const languages = builtInColorLanguages([]);
    expect(languages.get('css')).toBe(CSS_EXTENSION);
    expect(languages.get('less')).toBe(CSS_EXTENSION);
    expect(languages.get('scss')).toBe(CSS_EXTENSION);
    expect(languages.get('html')).toBe(HTML_EXTENSION);
    expect(languages.get('json')).toBe(JSON_EXTENSION);
    expect(languages.get('jsonc')).toBe(JSON_EXTENSION);
    expect(languages.get('snippets')).toBe(JSON_EXTENSION);
  });

  it('没有内置提供器的语言不在其中, 因此不探测', () => {
    const languages = builtInColorLanguages([]);
    expect(languages.get('sass')).toBeUndefined();
    expect(languages.get('stylus')).toBeUndefined();
    expect(languages.get('markdown')).toBeUndefined();
    expect(languages.get('typescriptreact')).toBeUndefined();
  });

  it('参与者贡献点把别的语言挂进内置语言服务', () => {
    // handlebars 就是这样进入 HTML 语言服务的; 语言集合因此不能写死。
    const languages = builtInColorLanguages([
      { contributes: { htmlLanguageParticipants: [{ languageId: 'handlebars', autoInsert: true }] } },
      { contributes: { jsonLanguageParticipants: [{ languageId: 'jsonl', comments: true }] } },
    ]);
    expect(languages.get('handlebars')).toBe(HTML_EXTENSION);
    expect(languages.get('jsonl')).toBe(JSON_EXTENSION);
  });

  it('清单形状不可信: 缺字段, 类型不对与空 languageId 一律忽略', () => {
    const languages = builtInColorLanguages([
      undefined,
      null,
      {},
      { contributes: null },
      { contributes: { htmlLanguageParticipants: 'handlebars' } },
      { contributes: { htmlLanguageParticipants: [null, 42, { languageId: 7 }, { languageId: '' }] } },
    ]);
    expect(languages.size).toBe(7);
    expect(languages.get('handlebars')).toBeUndefined();
    expect(languages.get('')).toBeUndefined();
  });

  it('参与者顶不掉基础集合的归属', () => {
    const languages = builtInColorLanguages([
      { contributes: { jsonLanguageParticipants: [{ languageId: 'css' }] } },
    ]);
    expect(languages.get('css')).toBe(CSS_EXTENSION);
  });
});

describe('其他提供器上报的 range 对应哪些覆盖键', () => {
  it('普通 range 只产出自己', () => {
    expect(coverageKeys('color: #ff8800;', { start: 7, end: 14 })).toEqual(['7:14']);
  });

  it('带引号的 range 额外产出引号内部的键', () => {
    // 内置 JSON 提供器上报整个字符串节点, 本扩展上报引号内的颜色本身。
    const text = '{ "editor.background": "#ff8800" }';
    expect(coverageKeys(text, { start: 23, end: 32 })).toEqual(['23:32', '24:31']);
  });

  it('引号不成对时不产出内部键', () => {
    expect(coverageKeys('"#ff8800 ', { start: 0, end: 9 })).toEqual(['0:9']);
  });

  it('长度不足两个字符时不产出内部键', () => {
    expect(coverageKeys('""', { start: 1, end: 1 })).toEqual(['1:1']);
  });
});

describe('探测结果的缓存策略', () => {
  it('非空结果无条件可缓存', () => {
    expect(shouldCacheProbe(3, true)).toBe(true);
    expect(shouldCacheProbe(3, false)).toBe(true);
  });

  it('其他提供器已就绪时, 空结果是稳定事实, 可缓存', () => {
    expect(shouldCacheProbe(0, true)).toBe(true);
  });

  it('其他提供器未就绪时, 空结果是暂态, 不可缓存', () => {
    expect(shouldCacheProbe(0, false)).toBe(false);
  });
});

describe('探测缓存的读写', () => {
  it('同一版本命中, 版本变化即失效', () => {
    const cache = new Map<string, ProbeEntry>();
    writeProbeCache(cache, 'file:///a.scss', entry(1, ['0:7']));
    expect(readProbeCache(cache, 'file:///a.scss', 1)).toEqual(new Set(['0:7']));
    expect(readProbeCache(cache, 'file:///a.scss', 2)).toBeUndefined();
  });

  it('未知 uri 不命中', () => {
    const cache = new Map<string, ProbeEntry>();
    expect(readProbeCache(cache, 'file:///missing.scss', 1)).toBeUndefined();
  });

  it('每个 uri 只保留一条, 新版本覆盖旧版本', () => {
    const cache = new Map<string, ProbeEntry>();
    writeProbeCache(cache, 'file:///a.scss', entry(1, ['0:7']));
    writeProbeCache(cache, 'file:///a.scss', entry(2, ['8:15']));
    expect(cache.size).toBe(1);
    expect(readProbeCache(cache, 'file:///a.scss', 2)).toEqual(new Set(['8:15']));
    expect(readProbeCache(cache, 'file:///a.scss', 1)).toBeUndefined();
  });

  it('两个文档来回切换不再互相冲刷', () => {
    const cache = new Map<string, ProbeEntry>();
    writeProbeCache(cache, 'file:///a.scss', entry(1, ['0:7']));
    writeProbeCache(cache, 'file:///b.scss', entry(1, ['3:10']));
    writeProbeCache(cache, 'file:///a.scss', entry(1, ['0:7']));
    expect(readProbeCache(cache, 'file:///a.scss', 1)).toEqual(new Set(['0:7']));
    expect(readProbeCache(cache, 'file:///b.scss', 1)).toEqual(new Set(['3:10']));
  });

  it('超出上限时淘汰最旧的条目', () => {
    const cache = new Map<string, ProbeEntry>();
    writeProbeCache(cache, 'oldest', entry(1), 2);
    writeProbeCache(cache, 'middle', entry(1), 2);
    writeProbeCache(cache, 'newest', entry(1), 2);
    expect(cache.size).toBe(2);
    expect(cache.has('oldest')).toBe(false);
    expect(cache.has('middle')).toBe(true);
    expect(cache.has('newest')).toBe(true);
  });

  it('重写已有 uri 会把它移到淘汰队尾', () => {
    const cache = new Map<string, ProbeEntry>();
    writeProbeCache(cache, 'first', entry(1), 2);
    writeProbeCache(cache, 'second', entry(1), 2);
    // 重写 first: 它不该再是"最旧"的那一个。
    writeProbeCache(cache, 'first', entry(2), 2);
    writeProbeCache(cache, 'third', entry(1), 2);
    expect(cache.has('second')).toBe(false);
    expect(cache.has('first')).toBe(true);
    expect(cache.has('third')).toBe(true);
  });

  it('默认上限为 50', () => {
    expect(PROBE_CACHE_LIMIT).toBe(50);
    const cache = new Map<string, ProbeEntry>();
    for (let i = 0; i < PROBE_CACHE_LIMIT + 10; i += 1) writeProbeCache(cache, `f${i}`, entry(1));
    expect(cache.size).toBe(PROBE_CACHE_LIMIT);
  });
});
