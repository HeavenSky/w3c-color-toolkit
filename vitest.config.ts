import { defineConfig } from 'vitest/config';

/**
 * 测试只覆盖不依赖 vscode 运行时的纯逻辑, 因此不需要 VS Code 集成测试 harness;
 * 需要宿主能力的接缝在测试里替换成内存实现。
 *
 * `test/performance/` 不在这里跑: 它耗时长且断言的是时间, 由 `vitest.perf.config.ts`
 * 单独触发 (没有性能测试的仓库不需要那份配置)。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/performance/**'],
    environment: 'node',
  },
});
