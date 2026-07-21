const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const contentScript = fs.readFileSync(path.join(root, 'src/contentScript.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
const downloader = fs.readFileSync(path.join(root, 'src/z-cnki-pdf-download.js'), 'utf8');
const sidepanel = fs.readFileSync(path.join(root, 'src/sidepanel.js'), 'utf8');

test('all web hosts inject the content script and allow the CNKI downloader bundle', () => {
  const generalScript = manifest.content_scripts.find(item => item.js.includes('contentScript.js'));
  assert.deepEqual(generalScript.matches, ['http://*/*', 'https://*/*']);
  assert.ok(manifest.host_permissions.includes('http://*/*'));
  assert.ok(manifest.host_permissions.includes('https://*/*'));
  assert.match(background, /'z-cnki-pdf-download\.js'/);
  assert.match(contentScript, /OPEN_CNKI_PDF_DOWNLOAD/);
  assert.match(contentScript, /GET_CNKI_PDF_LINKS/);
  assert.match(contentScript, /NATIVE_DOWNLOAD_CNKI_LINK/);
  assert.doesNotMatch(contentScript, /isCnkiVerificationVisible|verificationVisible/);
});

test('CNKI downloader validates PDFs, uses the selected folder, and deduplicates by SHA-256', () => {
  assert.match(downloader, /showDirectoryPicker/);
  assert.match(downloader, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(downloader, /knownHashes\.has\(sha256\)/);
  assert.match(downloader, /%PDF-/);
  assert.doesNotMatch(downloader, /chrome\.downloads/);
});

test('side-panel Download PDFs action uses trusted CNKI page clicks in both destination modes', () => {
  const action = sidepanel.match(/const startPageClickDownloads = async \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
  assert.match(action, /triggerCnkiTrustedDownload/);
  assert.match(action, /downloadCurrentPage/);
  assert.match(action, /waitForChromeDownloadCompletion/);
  assert.match(sidepanel, /world: 'MAIN'/);
  assert.match(sidepanel, /Input\.dispatchMouseEvent/);
  assert.match(sidepanel, /type: 'mousePressed'/);
  assert.match(sidepanel, /type: 'mouseReleased'/);
  assert.ok(manifest.permissions.includes('debugger'));
});

test('selected-folder mode intercepts the trusted click response and writes the validated PDF', () => {
  assert.match(sidepanel, /captureCnkiPdfWithTrustedClick/);
  assert.match(sidepanel, /Fetch\.enable/);
  assert.match(sidepanel, /requestStage: 'Response'/);
  assert.match(sidepanel, /Fetch\.takeResponseBodyAsStream/);
  assert.match(sidepanel, /IO\.read/);
  assert.match(sidepanel, /writable\.write\(blob\)/);
  assert.match(sidepanel, /Fetch\.failRequest/);
});
