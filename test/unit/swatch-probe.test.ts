/**
 * 色块探测缓存的策略与生命周期。
 *
 * 这三条规则是一次真实缺陷的回归: 空探测结果被缓存后, "没人覆盖"会被钉死到文档下一次
 * 改动为止, 于是本扩展与内置 CSS 提供器同时上报, 同一个颜色出现两个色块, 而探测本身
 * 没有失败, 所以输出面板里一条日志都没有。
 */
import { describe, expect, it } from 'vitest';

import {
  PROBE_CACHE_LIMIT,
  readProbeCache,
  shouldCacheProbe,
  writeProbeCache,
  type ProbeEntry,
} from '../../src/features/picker/swatch-plan.js';

const entry = (version: number, ranges: readonly string[] = []): ProbeEntry => ({
  version,
  covered: new Set(ranges),
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
