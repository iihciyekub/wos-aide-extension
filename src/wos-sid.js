'use strict';

const normalizeWosSid = (value) => {
  const sid = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(sid) ? sid : '';
};

const getSidFromUrl = (locationObject) => {
  try {
    const url = new URL(locationObject?.href || '', locationObject?.origin || undefined);
    return normalizeWosSid(url.searchParams.get('SID') || url.searchParams.get('sid'));
  } catch (_error) {
    return '';
  }
};

const getSidFromBootstrapScripts = (documentObject) => {
  const scripts = documentObject?.scripts;
  if (!scripts) {
    return '';
  }

  // WoS bootstraps sessionData in an inline script, then may remove the global
  // after the Angular application has consumed it. Read newest scripts first so
  // a refreshed SPA session wins over an older bootstrap value.
  for (let index = scripts.length - 1; index >= 0; index -= 1) {
    const script = scripts[index];
    if (script?.src) {
      continue;
    }
    const text = String(script?.textContent || '');
    if (!/sessionData|BasicProperties|["']SID["']/i.test(text)) {
      continue;
    }
    const match = text.match(/["']SID["']\s*:\s*["']([A-Za-z0-9_-]{16,128})["']/i);
    const sid = normalizeWosSid(match?.[1]);
    if (sid) {
      return sid;
    }
  }
  return '';
};

const resolveWosSid = ({
  windowObject = typeof window !== 'undefined' ? window : undefined,
  documentObject = typeof document !== 'undefined' ? document : undefined,
  locationObject = typeof location !== 'undefined' ? location : undefined
} = {}) => {
  const liveSid = normalizeWosSid(windowObject?.sessionData?.BasicProperties?.SID);
  if (liveSid) {
    return liveSid;
  }

  const urlSid = getSidFromUrl(locationObject);
  if (urlSid) {
    return urlSid;
  }

  return getSidFromBootstrapScripts(documentObject);
};

module.exports = {
  getSidFromBootstrapScripts,
  getSidFromUrl,
  normalizeWosSid,
  resolveWosSid
};
