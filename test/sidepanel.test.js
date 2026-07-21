'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('public/manifest.json'));
const sidepanel = read('src/sidepanel.js');
const sidepanelHtml = read('public/sidepanel.html');
const background = read('src/background.js');

test('extension action opens the native Chrome side panel', () => {
  assert.equal(manifest.name, 'WOS Aide');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(manifest.permissions.includes('downloads'));
  assert.ok(manifest.permissions.includes('debugger'));
  assert.ok(manifest.host_permissions.includes('https://www.webofscience.com/*'));
  assert.match(background, /openPanelOnActionClick:\s*true/);
  assert.match(sidepanelHtml, /id="downloadBtn"/);
  assert.doesNotMatch(sidepanelHtml, /id="nativeDownloadBtn"/);
  assert.match(sidepanelHtml, /id="chooseFolderLabel"/);
  assert.match(sidepanelHtml, /id="folderPermission"/);
  assert.match(sidepanelHtml, /id="downloadIntervalSeconds"/);
  assert.match(sidepanelHtml, /id="skipExistingPdfs"/);
  assert.match(sidepanelHtml, /id="doiBatchHost"/);
  assert.match(sidepanelHtml, /role="tablist"/);
  assert.doesNotMatch(sidepanelHtml, /openSettingsBtn|popup\.html/);
});

test('side panel performs CNKI page-click downloads with selected-folder deduplication', () => {
  assert.match(sidepanel, /showDirectoryPicker/);
  assert.match(sidepanel, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(sidepanel, /knownHashes/);
  assert.match(sidepanel, /GET_CNKI_PDF_LINKS/);
  assert.match(sidepanel, /world:\s*'MAIN'/);
  assert.match(sidepanel, /triggerCnkiTrustedDownload/);
  assert.match(sidepanel, /Input\.dispatchMouseEvent/);
  assert.match(sidepanel, /waitForChromeDownloadCompletion/);
  assert.match(sidepanel, /Clicking CNKI PDF icons in the logged-in page/);
  assert.match(sidepanel, /abbreviateMiddle/);
  assert.match(sidepanel, /Folder: \$\{abbreviateMiddle\(name, 22\)\}/);
  assert.match(sidepanel, /downloadLog\.textContent = line/);
  assert.doesNotMatch(sidepanel, /downloadLog\.textContent = `\[\$\{timestamp\}\] \$\{message\}\\n/);
  assert.match(sidepanel, /prepareDirectoryDeduplication/);
  assert.match(sidepanel, /linkExistsInDirectory/);
  assert.match(sidepanel, /indexCompletedPageDownload/);
  assert.match(sidepanel, /downloadIntervalMs/);
  assert.doesNotMatch(sidepanel, /verificationVisible|verificationWarning/);
  assert.doesNotMatch(sidepanelHtml, /security verification/i);
  assert.match(sidepanelHtml, /Download PDFs/);
  assert.match(sidepanelHtml, /Downloads always use CNKI page clicks/);
  assert.match(sidepanel, /require\('\.\/z-doi-pdf-download'\)/);
});
