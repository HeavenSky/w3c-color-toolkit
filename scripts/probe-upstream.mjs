// 一次性验证脚本: 核对方案第 3.6 节的"未验证项"。
// 结论写回方案文档后即可删除, 不参与构建与打包。
import { tokenize } from '@csstools/css-tokenizer';
import { parseComponentValue } from '@csstools/css-parser-algorithms';
import { color, ColorNotation, SyntaxFlag, serializeRGB } from '@csstools/css-color-parser';
import Color from 'colorjs.io';

const CASES = [
  ['#ff8800', 'color-4 hex'],
  ['rgb(255 136 0 / 50%)', 'color-4 modern rgb'],
  ['rgb(255, 136, 0)', 'color-3 legacy rgb'],
  ['hwb(30 0% 0%)', 'color-4 hwb'],
  ['lab(50% 40 30)', 'color-4 lab'],
  ['oklch(0.7 0.2 40deg)', 'color-4 oklch'],
  ['oklch(0.7 none 40)', 'color-4 none'],
  ['color(display-p3 1 0.5 0)', 'color-4 color()'],
  ['color(rec2020 1 0.5 0)', 'color-4 rec2020'],
  ['color(xyz-d50 0.2 0.3 0.1)', 'color-4 xyz-d50'],
  ['color-mix(in oklch, red, blue)', 'color-5 color-mix 2 colors'],
  ['color-mix(in oklch, red 20%, blue 30%, green 50%)', 'color-5 color-mix variadic'],
  ['color-mix(in hsl longer hue, red, blue)', 'color-5 hue interpolation'],
  ['rgb(from rebeccapurple r g b)', 'color-5 relative color'],
  ['oklch(from red calc(l * 0.5) c h)', 'color-5 relative + calc'],
  ['alpha(from red / 0.5)', 'color-5 relative alpha'],
  ['contrast-color(red)', 'color-5 contrast-color'],
  ['device-cmyk(0 0.5 1 0)', 'color-5 device-cmyk'],
  ['light-dark(white, black)', 'color-5 light-dark'],
  ['currentColor', 'color-4 currentColor'],
  ['Canvas', 'color-4 system color'],
  ['color(--my-profile 0.1 0.2 0.3)', 'color-5 custom profile'],
  ['contrast-color(red wcag2)', 'color-6 contrast-color wcag2'],
  ['contrast-color(red wcag2(aaa))', 'color-6 wcag2()'],
  ['color-layers(red, blue)', 'color-6 color-layers'],
  ['ictcp(0.5 0 0)', 'hdr ictcp'],
  ['jzazbz(0.5 0 0)', 'hdr jzazbz'],
  ['jzczhz(0.5 0.1 40)', 'hdr jzczhz'],
  ['hdr-color(red 1, blue 4)', 'hdr hdr-color'],
  ['color-hdr(red 1, blue 4)', 'hdr color-hdr alias'],
  ['color(rec2100-pq 0.5 0.5 0.5)', 'hdr rec2100-pq'],
  ['color(rec2100-hlg 0.5 0.5 0.5)', 'hdr rec2100-hlg'],
  ['color(rec2100-linear 0.5 0.5 0.5)', 'hdr rec2100-linear'],
];

console.log('== @csstools/css-color-parser ==');
for (const [input, label] of CASES) {
  let result = 'PARSE-ERROR';
  try {
    const cv = parseComponentValue(tokenize({ css: input }));
    const data = cv ? color(cv) : false;
    if (data === false) {
      result = 'unsupported';
    } else {
      const flags = [...data.syntaxFlags].join(',');
      const ch = data.channels.map((n) => (typeof n === 'number' ? Number(n.toFixed(4)) : n));
      result = `notation=${data.colorNotation} channels=[${ch}] alpha=${typeof data.alpha === 'number' ? data.alpha : 'node'} flags={${flags}}`;
    }
  } catch (e) {
    result = `THROW ${e.message}`;
  }
  console.log(`${label.padEnd(32)} ${input.padEnd(50)} -> ${result}`);
}

console.log('\n== colorjs.io spaces ==');
for (const id of [
  'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020',
  'xyz-d50', 'xyz-d65', 'lab', 'lch', 'oklab', 'oklch', 'hsl', 'hwb',
  'ictcp', 'jzazbz', 'jzczhz', 'rec2100pq', 'rec2100hlg', 'rec2100-pq', 'rec2100-hlg', 'rec2100-linear',
  'acescc', 'hsv',
]) {
  let ok = 'MISSING';
  try {
    const c = new Color('white').to(id);
    ok = `ok coords=[${c.coords.map((n) => Number(n.toFixed(4)))}]`;
  } catch (e) {
    ok = `MISSING (${e.message.slice(0, 60)})`;
  }
  console.log(`${id.padEnd(16)} -> ${ok}`);
}

console.log('\n== colorjs.io registry ids ==');
console.log(Object.keys(Color.spaces).join(' '));

console.log('\n== colorjs.io capabilities ==');
const c = new Color('oklch(0.7 0.2 40)');
console.log('toGamut css method:', typeof c.toGamut === 'function');
console.log('to xyz-d50:', new Color('#ff8800').to('xyz-d50').coords);
console.log('gamut-mapped srgb of p3 lime:', new Color('color(display-p3 0 1 0)').toGamut({ space: 'srgb', method: 'css' }).toString({ format: 'hex' }));
console.log('serialize oklch:', new Color('#ff8800').to('oklch').toString({ precision: 5 }));
console.log('contrast WCAG21:', new Color('white').contrast('black', 'WCAG21'));
console.log('serializeRGB smoke:', serializeRGB(color(parseComponentValue(tokenize({ css: 'oklch(0.7 0.2 40)' })))).toString());
console.log('ColorNotation values:', Object.values(ColorNotation).join(' '));
console.log('SyntaxFlag values:', Object.values(SyntaxFlag).join(' '));
