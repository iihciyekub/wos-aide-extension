'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('side panel hosts SID, DOI search, and UUID export without page overlays', () => {
  const html = read('public/sidepanel.html');
  const popup = read('src/popup.js');
  const contentScript = read('src/contentScript.js');
  const sidepanelTools = read('src/sidepanel-wos-tools.js');
  const sidepanelCss = read('src/sidepanel.css');

  assert.match(html, /id="wosSidValue"/);
  assert.match(html, /id="copyWosSidBtn"/);
  assert.match(html, /id="wosDoiToolPanel"/);
  assert.match(html, /id="wosUuidToolPanel"/);
  assert.match(html, /id="runWosDoiSearchBtn"/);
  assert.match(html, /id="runWosUuidExportBtn"/);
  assert.match(html, /id="scholarJournalInput"/);
  assert.match(html, /id="searchScholarRankBtn"/);
  assert.match(popup, /func:\s*resolveWosSidInMainWorld/);
  assert.match(sidepanelTools, /export_range_data/);
  assert.match(sidepanelTools, /FETCH_EASYSCHOLAR_RANK/);
  assert.match(sidepanelTools, /elements\.doiPanel\.hidden = !isDoi/);
  assert.match(sidepanelTools, /elements\.uuidPanel\.hidden = isDoi/);
  assert.match(sidepanelTools, /wos-aide:wos-tab-activated/);
  assert.match(sidepanelCss, /\.wos-inner-panel\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(sidepanelCss, /\.button:disabled:hover[\s\S]{0,180}pointer-events:\s*none/);
  assert.match(sidepanelCss, /\.button:disabled i\s*\{\s*color:\s*inherit/);
  assert.doesNotMatch(html, /diagnoseWosBtn|Diagnose WOS Page/);
  assert.doesNotMatch(popup, /WOS connection failed:/);
  assert.match(contentScript, /action:\s*request\.preferredTab === 'journal' \? 'sidepanel-scholar' : 'sidepanel-wos'/);
  assert.doesNotMatch(contentScript, /bootstrapWosToolbarShortcuts\(\);\s*ensureWosToolbarShortcuts\(\);/);
});

test('side panel exposes tabbed CNKI, WOS, LLM, and EasyScholar views', () => {
  const html = read('public/sidepanel.html');
  const sidepanelSource = read('src/sidepanel.js');
  assert.match(html, /id="tabCnki"/);
  assert.match(html, /id="tabWos"/);
  assert.match(html, /id="tabDoi"/);
  assert.match(html, /id="tabLlm"/);
  assert.match(html, /id="tabScholar"/);
  assert.match(html, /id="downloadBtn"/);
  assert.doesNotMatch(html, /id="nativeDownloadBtn"/);
  assert.match(html, /id="openaiSettingsPanel"/);
  assert.match(html, /id="llmChatMessages"/);
  assert.match(html, /id="sendLlmChatBtn"/);
  assert.match(html, /id="easyScholarSettingsPanel"/);
  assert.match(html, /id="doiPanel"/);
  assert.match(sidepanelSource, /activatePanel/);
});
