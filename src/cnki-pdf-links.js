const CNKI_DOWNLOAD_SELECTOR = [
  '#gridTable a.downloadlink:not(.prohibitLink)',
  '#gridTable a.icon-download:not(.prohibitLink)',
  'a.downloadlink.icon-download:not(.prohibitLink)'
].join(', ');

const isCnkiLocation = (hostname) => /(^|\.)cnki\.net$/i.test(String(hostname || '').trim());

const nonEmpty = (value) => typeof value === 'string' && value.trim() ? value.trim() : '';

const extractOnClickUrl = (value) => {
  const source = nonEmpty(value);
  if (!source) return '';
  const quotedUrls = Array.from(source.matchAll(/['"]([^'"]+)['"]/g), match => match[1]);
  return quotedUrls.find(candidate => /(?:download|pdf|kns8s|kcms)/i.test(candidate)) || '';
};

const getDownloadUrlCandidate = (element) => {
  if (!element) return '';
  const attributes = [
    'href',
    'data-download-url',
    'data-downloadlink',
    'data-url',
    'data-href',
    'data-link',
    'downloadurl'
  ];
  for (const attribute of attributes) {
    const value = nonEmpty(element.getAttribute?.(attribute));
    if (!value) continue;
    if (/^javascript:/i.test(value)) {
      const embedded = extractOnClickUrl(value);
      if (embedded) return embedded;
      continue;
    }
    if (value !== '#') return value;
  }
  const closestAnchor = element.closest?.('a[href]');
  const anchorHref = nonEmpty(closestAnchor?.getAttribute?.('href'));
  if (anchorHref && !/^(?:javascript:|#)/i.test(anchorHref)) return anchorHref;
  return extractOnClickUrl(element.getAttribute?.('onclick'));
};

const resolveDownloadUrl = (candidate, baseUrl) => {
  const raw = nonEmpty(candidate);
  if (!raw || /^(?:javascript:|#)/i.test(raw)) return '';
  try {
    const resolved = new URL(raw, baseUrl);
    return /^https?:$/i.test(resolved.protocol) ? resolved.href : '';
  } catch (_error) {
    return '';
  }
};

const readResultTitle = (element, fallbackIndex) => {
  const row = element?.closest?.('tr, dd, li, .result-table-list, .result-item, .list-item, .search-result-item');
  const titleElement = row?.querySelector?.(
    '.name a, h6 a, .title a, .result-title a, .result-table-list-title a, a.fz14, a[title]:not(.downloadlink), [data-title]'
  );
  return nonEmpty(titleElement?.getAttribute?.('title'))
    || nonEmpty(titleElement?.getAttribute?.('data-title'))
    || nonEmpty(titleElement?.textContent)
    || nonEmpty(element?.getAttribute?.('title'))
    || `CNKI article ${fallbackIndex}`;
};

const collectCnkiPdfLinks = (root, baseUrl) => {
  const elements = Array.from(root?.querySelectorAll?.(CNKI_DOWNLOAD_SELECTOR) || []);
  const seen = new Set();
  const links = [];
  elements.forEach((element, index) => {
    const url = resolveDownloadUrl(getDownloadUrlCandidate(element), baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({
      url,
      title: readResultTitle(element, index + 1),
      position: index + 1
    });
  });
  return links;
};

const decodeDispositionValue = (value) => {
  const normalized = nonEmpty(value).replace(/^UTF-8''/i, '');
  try {
    return decodeURIComponent(normalized);
  } catch (_error) {
    return normalized;
  }
};

const fileNameFromContentDisposition = (header) => {
  const value = nonEmpty(header);
  if (!value) return '';
  const encoded = value.match(/filename\*\s*=\s*([^;]+)/i)?.[1];
  if (encoded) return decodeDispositionValue(encoded.replace(/^['"]|['"]$/g, ''));
  return nonEmpty(value.match(/filename\s*=\s*"([^"]+)"/i)?.[1])
    || nonEmpty(value.match(/filename\s*=\s*([^;]+)/i)?.[1]).replace(/^['"]|['"]$/g, '');
};

const sanitizePdfFileName = (value, fallback = 'CNKI article') => {
  const base = nonEmpty(value)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 180)
    || fallback;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
};

module.exports = {
  CNKI_DOWNLOAD_SELECTOR,
  collectCnkiPdfLinks,
  fileNameFromContentDisposition,
  getDownloadUrlCandidate,
  isCnkiLocation,
  resolveDownloadUrl,
  sanitizePdfFileName
};
