// Builds the browser files in dist/ from src/mini-react.js.
//
//   dist/mini-react.global.js  classic <script> build, defines window.MiniReact (readable)
//   dist/mini-react.min.js     the same, minified
//
// Classic scripts also load from file://, so the HTML pages work with a double-click.
// Run with: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { minify } from 'terser';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const source = readFileSync(new URL('src/mini-react.js', root), 'utf8');
const names = [];

const body = source
  // Collect and strip `export function name` / `export const name`
  .replace(/^export (function|const) (\w+)/gm, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  })
  // `export { createElement as h };` becomes an alias in the global object
  .replace(/^export \{ createElement as h \};\n/m, '');

if (/^export /m.test(body)) throw new Error('Unhandled export left in the source');

const banner = `/*! mini-react v${pkg.version} | MIT License */`;
const global = `${banner}
/* Generated from src/mini-react.js by scripts/build.mjs. Do not edit. */
(function () {
'use strict';
${body}
window.MiniReact = { h: createElement, ${names.join(', ')} };
})();
`;

const min = await minify(global, {
  compress: { passes: 2 },
  mangle: true,
  format: { comments: /^!/ },
});

mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/mini-react.global.js', root), global);
writeFileSync(new URL('dist/mini-react.min.js', root), min.code + '\n');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`dist/mini-react.global.js  ${kb(global.length)}`);
console.log(`dist/mini-react.min.js     ${kb(min.code.length)} (${kb(gzipSync(min.code).length)} gzipped)`);
console.log(`exports: h, ${names.join(', ')}`);
