const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CNKI_DOWNLOAD_SELECTOR,
  collectCnkiPdfLinks,
  fileNameFromContentDisposition,
  isCnkiLocation,
  resolveDownloadUrl,
  sanitizePdfFileName
} = require('../src/cnki-pdf-links');

const fakeDownloadElement = ({ href, title, onclick = '' }) => {
  const titleElement = {
    textContent: title,
    getAttribute: () => ''
  };
  const row = { querySelector: () => titleElement };
  return {
    getAttribute: (name) => ({ href, onclick }[name] || ''),
    closest: (selector) => selector === 'a[href]' ? null : row
  };
};

test('recognizes CNKI hosts and the observed download icon selector', () => {
  assert.equal(isCnkiLocation('oversea.cnki.net'), true);
  assert.equal(isCnkiLocation('www.cnki.net'), true);
  assert.equal(isCnkiLocation('cnki.example.com'), false);
  assert.match(CNKI_DOWNLOAD_SELECTOR, /downloadlink\.icon-download/);
  assert.match(CNKI_DOWNLOAD_SELECTOR, /a\.icon-download/);
});

test('collects unique current-page CNKI download links with titles', () => {
  const elements = [
    fakeDownloadElement({ href: '/kns8s/download?id=1', title: 'First paper' }),
    fakeDownloadElement({ href: '/kns8s/download?id=1', title: 'Duplicate button' }),
    fakeDownloadElement({ href: '/kns8s/download?id=2', title: 'Second paper' })
  ];
  const root = { querySelectorAll: () => elements };
  assert.deepEqual(collectCnkiPdfLinks(root, 'https://oversea.cnki.net/kns8s/advsearch'), [
    { url: 'https://oversea.cnki.net/kns8s/download?id=1', title: 'First paper', position: 1 },
    { url: 'https://oversea.cnki.net/kns8s/download?id=2', title: 'Second paper', position: 3 }
  ]);
});

test('rejects non-web download targets', () => {
  assert.equal(resolveDownloadUrl('javascript:void(0)', 'https://oversea.cnki.net/'), '');
  assert.equal(resolveDownloadUrl('file:///tmp/paper.pdf', 'https://oversea.cnki.net/'), '');
});

test('extracts a download URL embedded in a javascript action', () => {
  const element = fakeDownloadElement({
    href: "javascript:download('/kns8s/download?id=3')",
    title: 'Embedded link'
  });
  const root = { querySelectorAll: () => [element] };
  assert.equal(
    collectCnkiPdfLinks(root, 'https://oversea.cnki.net/kns8s/advsearch')[0].url,
    'https://oversea.cnki.net/kns8s/download?id=3'
  );
});

test('reads CNKI downloadurl attributes used by alternate result layouts', () => {
  const element = fakeDownloadElement({ href: '', title: 'Alternate layout' });
  const originalGetAttribute = element.getAttribute;
  element.getAttribute = name => name === 'downloadurl'
    ? '/kns8s/download?id=alternate'
    : originalGetAttribute(name);
  const root = { querySelectorAll: () => [element] };
  assert.equal(
    collectCnkiPdfLinks(root, 'https://oversea.cnki.net/kns8s/search')[0].url,
    'https://oversea.cnki.net/kns8s/download?id=alternate'
  );
});

test('creates safe PDF filenames from response headers and article titles', () => {
  assert.equal(
    fileNameFromContentDisposition("attachment; filename*=UTF-8''%E7%A0%94%E7%A9%B6.pdf"),
    '研究.pdf'
  );
  assert.equal(sanitizePdfFileName('A/B: study?'), 'A_B_ study_.pdf');
  assert.equal(sanitizePdfFileName('Already.pdf'), 'Already.pdf');
});
