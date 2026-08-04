/**
 * 双入口打包: `dist/extension-node.js` 与 `dist/extension-web.js`。
 *
 * - `vscode` 为外部模块;
 * - 生产包不含 source map (方案第 9 节);
 * - Web bundle 目标为 browser platform, 不允许打进 Node 内置模块。
 */
import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  target: 'node20',
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
  legalComments: 'none',
};

const targets = [
  {
    ...shared,
    entryPoints: ['src/extension-node.ts'],
    outfile: 'dist/extension-node.js',
    platform: 'node',
  },
  {
    ...shared,
    entryPoints: ['src/extension-web.ts'],
    outfile: 'dist/extension-web.js',
    platform: 'browser',
    target: 'es2022',
    // Web Extension Host 没有 Node 内置模块; 打包时必须显式失败而不是静默 shim。
    define: { global: 'globalThis' },
  },
];

if (watch) {
  for (const options of targets) {
    const ctx = await context(options);
    await ctx.watch();
  }
  console.log('watching…');
} else {
  await Promise.all(targets.map((options) => build(options)));
}
