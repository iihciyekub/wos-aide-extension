'use strict';

// Keep this function self-contained: Chrome serializes it when executeScript
// runs it in the page's MAIN world, so it cannot depend on module closures.
const resolveWosSidInMainWorld = (context = {}) => {
  const pageWindow = context.windowObject || (typeof window !== 'undefined' ? window : globalThis);
  const pageDocument = context.documentObject || (typeof document !== 'undefined' ? document : undefined);
  const pageLocation = context.locationObject || (typeof location !== 'undefined' ? location : undefined);
  const normalize = value => {
    const sid = String(value || '').trim();
    return /^[A-Za-z0-9_-]{16,128}$/.test(sid) ? sid : '';
  };

  const liveSid = normalize(pageWindow?.sessionData?.BasicProperties?.SID);
  if (liveSid) {
    return liveSid;
  }

  try {
    const url = new URL(pageLocation?.href || '', pageLocation?.origin || undefined);
    const urlSid = normalize(url.searchParams.get('SID') || url.searchParams.get('sid'));
    if (urlSid) {
      return urlSid;
    }
  } catch (_error) {
    // Continue to the bootstrap-script fallback.
  }

  const scripts = pageDocument?.scripts;
  if (!scripts) {
    return '';
  }
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
    const sid = normalize(match?.[1]);
    if (sid) {
      return sid;
    }
  }
  return '';
};

module.exports = { resolveWosSidInMainWorld };
