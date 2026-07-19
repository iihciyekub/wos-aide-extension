'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('WOS page scripts use native MAIN-world injection instead of script tags', () => {
  const contentScript = read('src/contentScript.js');
  const loader = read('src/z-Wos-loader.js');
  const background = read('src/background.js');

  assert.match(contentScript, /INJECT_MAIN_WORLD_FILES/);
  assert.match(loader, /INJECT_MAIN_WORLD_FILES/);
  assert.match(background, /world:\s*'MAIN'/);
  assert.doesNotMatch(contentScript, /createElement\(['"]script['"]\)/);
  assert.doesNotMatch(loader, /createElement\(['"]script['"]\)/);
});

test('proxy registrations set a persistent WOS marker before extension scripts', () => {
  const popup = read('src/popup.js');
  const marker = read('src/wos-proxy-marker.js');

  assert.match(popup, /persistAcrossSessions:\s*true/);
  assert.match(popup, /\['wos-proxy-marker\.js', 'contentScript\.js'\]/);
  assert.match(marker, /__WOS_AIDE_PROXY_HOST__\s*=\s*true/);
});

test('PDF toggle state is persisted and restored', () => {
  const popup = read('src/popup.js');

  assert.match(popup, /storage\.local\.get\(\['doiPdfDownloadEnabled'\]/);
  assert.match(popup, /storage\.local\.set\(\{ doiPdfDownloadEnabled: nextEnabled \}/);
});
