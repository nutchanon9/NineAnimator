#!/usr/bin/env node
/*
 * Bundle web/ into ONE self-contained HTML file (CSS and our JS inlined;
 * three.js and fonts still come from their CDNs). Handy for sharing a
 * single file or hosting anywhere.
 *
 *   node tools/build-single.js [out.html]          -> dist/nineanimator.html
 *   node tools/build-single.js out.html --fragment -> page body only, no
 *                                                     <html>/<head>/<body>
 *                                                     wrapper (for hosts that
 *                                                     add their own)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..', 'web');
const outFile = process.argv[2] || path.join(__dirname, '..', 'dist', 'nineanimator.html');
const fragment = process.argv.includes('--fragment');

let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) =>
  `<style>\n${fs.readFileSync(path.join(web, href), 'utf8')}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${fs.readFileSync(path.join(web, src), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);

if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.error(`wrote ${outFile} (${Math.round(html.length / 1024)} KB)`);
