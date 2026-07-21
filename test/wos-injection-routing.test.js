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
  assert.match(background, /GET_CURRENT_WOS_SID/);
  assert.match(background, /func:\s*resolveWosSidInMainWorld/);
  assert.match(contentScript, /retryDelays\s*=\s*\[0, 120, 350\]/);
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

test('DOI PDF downloader is hosted in the side panel without page-overlay auto injection', () => {
  const sidepanel = read('src/sidepanel.js');
  const contentScript = read('src/contentScript.js');

  assert.match(sidepanel, /doiBatchHost|z-doi-pdf-download/);
  assert.match(sidepanel, /ref-paper-downloader/);
  assert.doesNotMatch(contentScript, /changes\.doiPdfDownloadEnabled[\s\S]{0,400}injectModule\('doiPdfDownload'\)/);
});

test('WOS query, UUID export, and journal lookup stay in the side panel', () => {
  const contentScript = read('src/contentScript.js');
  const sidepanel = read('src/sidepanel-wos-tools.js');

  assert.match(sidepanel, /clipboard-reader-box/);
  assert.match(sidepanel, /wos_easyscholar_panel/);
  assert.match(sidepanel, /wos-aide-toolbar-shortcuts/);
  assert.match(sidepanel, /showDirectoryPicker/);
  assert.match(sidepanel, /writeTextFile/);
  assert.match(sidepanel, /Journal Rank Lookup|FETCH_EASYSCHOLAR_RANK/);
  assert.doesNotMatch(contentScript, /injectModule\('easyscholar'\)\.catch/);
});
