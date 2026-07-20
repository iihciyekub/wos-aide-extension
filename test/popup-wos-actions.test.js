'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('popup exposes SID, DOI search, and UUID download quick actions', () => {
  const html = read('public/popup.html');
  const popup = read('src/popup.js');
  const contentScript = read('src/contentScript.js');

  assert.match(html, /id="wosSidValue"/);
  assert.match(html, /id="copyWosSidBtn"/);
  assert.match(html, /id="openWosDoiSearchBtn"/);
  assert.match(html, /id="openWosUuidDownloadBtn"/);
  assert.match(popup, /func:\s*resolveWosSidInMainWorld/);
  assert.match(popup, /preferredTab, forceOpen:\s*true/);
  assert.match(contentScript, /toolbarShortcutsReady\s*&&\s*!request\.forceOpen/);
});
