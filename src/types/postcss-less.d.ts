/**
 * `postcss-less@6` 不随包提供类型声明 (`package.json` 没有 `types` 字段, `lib/` 下只有 `.js`),
 * 而 DefinitelyTyped 上的 `@types/postcss-less` 停在 4.x, 与本仓库使用的 6.x 不同代。
 *
 * 因此这里按 `node_modules/postcss-less/lib/index.js` 的实际导出声明本仓库用到的那部分:
 * 它是 CommonJS 的 `module.exports = { parse, stringify, nodeToString }`, 且 `parse` 返回
 * `Root` (不像 `postcss.Syntax` 那样是可选方法且可能返回 `Document`)。
 * 只声明用到的成员, 避免引入一份过期类型对未使用的 API 做出错误承诺。
 */
declare module 'postcss-less' {
  import type { Parser, Root, Stringifier } from 'postcss';

  export const parse: Parser<Root>;
  export const stringify: Stringifier;
}
