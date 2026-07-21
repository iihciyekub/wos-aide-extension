'use strict';

import './popup.js';
import './sidepanel.css';
const { fileNameFromContentDisposition, sanitizePdfFileName } = require('./cnki-pdf-links');
const { directoryLockName, runWithWebLock } = require('./pdf-tab-directory');
const { initializeWosSidePanelTools } = require('./sidepanel-wos-tools');
const { initializeLlmSidePanelChat } = require('./sidepanel-llm-chat');

window.__WOS_AIDE_DOI_SIDE_PANEL__ = true;
window.clampPanelPosition = window.clampPanelPosition || ((options = {}) => ({
  top: Number.parseFloat(options.top) || Number(options.defaultTop) || 0,
  left: Number.parseFloat(options.left) || Number(options.defaultLeft) || 0
}));
require('./z-doi-pdf-download');
initializeWosSidePanelTools();
initializeLlmSidePanelChat();

(function initializeSidePanel() {
  const INDEX_FILE_NAME = 'cnki-pdf-download-index.json';
  const DIRECTORY_HANDLE_KEY = 'cnki-sidepanel-directory';
  const DOWNLOAD_OPTIONS_KEY = 'cnki-sidepanel-download-options';
  const CNKI_FETCH_ATTEMPTS = 3;
  const CNKI_FETCH_RETRY_DELAYS = [1200, 3000];
  const elements = {
    pageStatus: document.getElementById('pageStatus'),
    pdfCount: document.getElementById('pdfCount'),
    folderName: document.getElementById('folderName'),
    folderPermission: document.getElementById('folderPermission'),
    chooseFolderLabel: document.getElementById('chooseFolderLabel'),
    refreshPageBtn: document.getElementById('refreshPageBtn'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    downloadIntervalSeconds: document.getElementById('downloadIntervalSeconds'),
    skipExistingPdfs: document.getElementById('skipExistingPdfs'),
    downloadBtn: document.getElementById('downloadBtn'),
    stopBtn: document.getElementById('stopBtn'),
    progressText: document.getElementById('progressText'),
    progressBar: document.getElementById('progressBar'),
    downloadLog: document.getElementById('downloadLog')
  };

  let activeTab = null;
  let currentLinks = [];
  let directoryHandle = null;
  let activeController = null;
  let downloadIntervalMs = 1500;
  let skipExistingPdfs = true;

  const tabTitles = {
    cnkiPanel: 'CNKI PDF Download',
    wosPanel: 'WOS Tools',
    doiPanel: 'Batch DOI PDF Download',
    llmPanel: 'LLM Settings',
    scholarPanel: 'Journal Rank Lookup'
  };

  const refreshWosPanel = () => {
    window.setTimeout(() => document.getElementById('refreshWosSidBtn')?.click(), 0);
    window.dispatchEvent(new CustomEvent('wos-aide:wos-tab-activated'));
  };

  const activatePanel = (panelId) => {
    document.querySelectorAll('.tab-button').forEach(button => {
      const active = button.dataset.panel === panelId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      const active = panel.id === panelId;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    chrome.storage.local.set({ wosAideSidePanelTab: panelId });
    if (panelId === 'wosPanel') refreshWosPanel();
  };

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => activatePanel(button.dataset.panel));
  });

  chrome.storage.local.get(['wosAideSidePanelTab'], result => {
    const requested = result.wosAideSidePanelTab;
    activatePanel(tabTitles[requested] ? requested : 'cnkiPanel');
  });

  chrome.storage.local.set({ doiPdfDownloadEnabled: false });

  const setStatus = (message, variant = 'info') => {
    elements.pageStatus.textContent = message;
    elements.pageStatus.className = `status status--${variant}`;
  };

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const line = `[${timestamp}] ${String(message || '').replace(/\s+/g, ' ').trim()}`;
    elements.downloadLog.textContent = line;
    elements.downloadLog.title = line;
  };

  const setProgress = (completed, total, label = '') => {
    const percent = total > 0 ? Math.round(completed / total * 100) : 0;
    elements.progressBar.style.width = `${percent}%`;
    elements.progressText.textContent = label || (total > 0 ? `${completed}/${total}` : 'Idle');
  };

  const abbreviateMiddle = (value, maximumLength) => {
    const characters = Array.from(String(value || ''));
    if (characters.length <= maximumLength) return characters.join('');
    const remaining = maximumLength - 1;
    const startLength = Math.ceil(remaining / 2);
    const endLength = Math.floor(remaining / 2);
    return `${characters.slice(0, startLength).join('')}…${characters.slice(-endLength).join('')}`;
  };

  const showDirectoryName = (handle, granted = true) => {
    const name = handle?.name || 'Not selected';
    elements.folderName.textContent = abbreviateMiddle(name, 30);
    elements.folderPermission.textContent = handle && !granted ? '· permission required' : '';
    elements.chooseFolderLabel.textContent = handle ? `Folder: ${abbreviateMiddle(name, 22)}` : 'Choose Folder';
    elements.chooseFolderBtn.title = handle
      ? `Existing-PDF comparison folder: ${name}`
      : 'Choose a folder for existing-PDF checks';
    elements.folderName.title = handle ? name : '';
  };

  const setRunning = (running) => {
    elements.refreshPageBtn.disabled = running;
    elements.chooseFolderBtn.disabled = running;
    elements.downloadBtn.disabled = running || !currentLinks.length;
    elements.stopBtn.disabled = !running;
  };

  const isCnkiUrl = (value) => {
    try {
      return /(^|\.)cnki\.net$/i.test(new URL(value || '').hostname);
    } catch (_error) {
      return false;
    }
  };

  const queryActiveTab = () => new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] || null));
  });

  const removeLegacyDoiOverlay = (tabId) => {
    if (!tabId) return;
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.getElementById('ref-paper-downloader')?.remove()
    }, () => void chrome.runtime.lastError);
  };

  const sendMessageWithBootstrap = (tabId, message) => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (!chrome.runtime.lastError) {
        resolve(response || {});
        return;
      }
      const initialError = chrome.runtime.lastError.message || '';
      if (!/Receiving end does not exist/i.test(initialError)) {
        reject(new Error(initialError));
        return;
      }
      chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        chrome.tabs.sendMessage(tabId, message, retryResponse => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(retryResponse || {});
        });
      });
    });
  });

  const locateCnkiDownloadTarget = (tabId, link) => new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async ({ position, url }) => {
        const selector = '#gridTable a.downloadlink:not(.prohibitLink), #gridTable a.icon-download:not(.prohibitLink), a.downloadlink.icon-download:not(.prohibitLink)';
        const elements = Array.from(document.querySelectorAll(selector));
        const normalizeUrl = value => {
          const raw = String(value || '').trim();
          if (!raw || /^(?:javascript:|#)/i.test(raw)) return '';
          try { return new URL(raw, location.href).href; } catch (_error) { return ''; }
        };
        const candidateUrl = element => {
          const attributes = ['href', 'data-download-url', 'data-downloadlink', 'data-url', 'data-href', 'data-link', 'downloadurl'];
          for (const name of attributes) {
            const raw = element.getAttribute?.(name) || '';
            const normalized = normalizeUrl(raw);
            if (normalized) return normalized;
          }
          return normalizeUrl(element.closest?.('a[href]')?.getAttribute('href'));
        };
        const requestedUrl = normalizeUrl(url);
        const byUrl = requestedUrl ? elements.find(element => candidateUrl(element) === requestedUrl) : null;
        const target = byUrl || elements[Math.max(0, Number(position || 1) - 1)];
        if (!target) return { success: false, error: 'The CNKI download icon is no longer present.' };

        const clickable = target.closest?.('a[href], button, [role="button"]') || target;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        const style = getComputedStyle(clickable);
        const rect = clickable.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
          return { success: false, error: 'The matching CNKI download icon is hidden.' };
        }
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hitTarget = document.elementFromPoint(x, y);
        if (!hitTarget || (!clickable.contains(hitTarget) && !hitTarget.contains(clickable))) {
          return { success: false, error: 'Another page element is covering the CNKI download icon.' };
        }
        return { success: true, x, y, position: Number(position || 1) };
      },
      args: [{ position: link.position, url: link.url }]
    }, results => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(results?.[0]?.result || { success: false, error: 'The CNKI page returned no click target.' });
    });
  });

  const attachDebugger = target => new Promise((resolve, reject) => {
    if (!chrome.debugger?.attach) {
      reject(new Error('Trusted browser click support is unavailable. Reload extension version 0.1.21.'));
      return;
    }
    chrome.debugger.attach(target, '1.3', () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  const sendDebuggerCommand = (target, method, params) => new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });

  const detachDebugger = target => new Promise(resolve => {
    chrome.debugger.detach(target, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });

  const dispatchTrustedMouseClick = async (target, point) => {
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y, button: 'none'
    });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1
    });
    await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1
    });
  };

  const triggerCnkiTrustedDownload = async (tabId, link) => {
    const point = await locateCnkiDownloadTarget(tabId, link);
    if (!point?.success) return point;
    const target = { tabId };
    await attachDebugger(target);
    try {
      await dispatchTrustedMouseClick(target, point);
      await new Promise(resolve => window.setTimeout(resolve, 150));
      return { success: true, method: 'trusted-browser-input', position: point.position };
    } finally {
      await detachDebugger(target);
    }
  };

  const responseHeaderValue = (headers, name) => {
    const expected = String(name || '').toLowerCase();
    return String((headers || []).find(header => String(header.name || '').toLowerCase() === expected)?.value || '');
  };

  const waitForInterceptedCnkiPdf = (target, signal) => new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      chrome.debugger.onEvent.removeListener(onEvent);
    };
    const finish = (callback, value) => {
      cleanup();
      callback(value);
    };
    const onAbort = () => finish(reject, new DOMException('Download stopped', 'AbortError'));
    const onEvent = (source, method, params) => {
      if (source.tabId !== target.tabId || method !== 'Fetch.requestPaused' || !params.responseStatusCode) return;
      const contentType = responseHeaderValue(params.responseHeaders, 'content-type');
      const contentDisposition = responseHeaderValue(params.responseHeaders, 'content-disposition');
      const redirect = params.responseStatusCode >= 300 && params.responseStatusCode < 400;
      const pdfResponse = !redirect && (
        /application\/pdf|application\/octet-stream/i.test(contentType)
        || /attachment/i.test(contentDisposition)
      );
      if (pdfResponse) {
        finish(resolve, { ...params, contentType, contentDisposition });
        return;
      }
      void sendDebuggerCommand(target, 'Fetch.continueRequest', { requestId: params.requestId }).catch(error => {
        finish(reject, error);
      });
    };
    chrome.debugger.onEvent.addListener(onEvent);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = window.setTimeout(() => {
      finish(reject, new Error('The trusted CNKI click did not produce an interceptable PDF response within 30 seconds.'));
    }, 30000);
  });

  const readDebuggerStream = async (target, handle, signal) => {
    const chunks = [];
    try {
      while (true) {
        if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
        const part = await sendDebuggerCommand(target, 'IO.read', { handle, size: 256 * 1024 });
        const binary = part.base64Encoded ? atob(part.data || '') : part.data || '';
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        if (bytes.length) chunks.push(bytes);
        if (part.eof) break;
      }
      return chunks;
    } finally {
      await sendDebuggerCommand(target, 'IO.close', { handle }).catch(() => {});
    }
  };

  const captureCnkiPdfWithTrustedClick = async (tabId, link, signal) => {
    const point = await locateCnkiDownloadTarget(tabId, link);
    if (!point?.success) throw new Error(point?.error || 'The CNKI download control could not be located.');
    const target = { tabId };
    let paused = null;
    await attachDebugger(target);
    try {
      await sendDebuggerCommand(target, 'Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Response' }]
      });
      const intercepted = waitForInterceptedCnkiPdf(target, signal);
      await dispatchTrustedMouseClick(target, point);
      paused = await intercepted;
      const { stream } = await sendDebuggerCommand(target, 'Fetch.takeResponseBodyAsStream', {
        requestId: paused.requestId
      });
      const chunks = await readDebuggerStream(target, stream, signal);
      const blob = new Blob(chunks, { type: paused.contentType || 'application/pdf' });
      const validationError = await validatePdf(blob, paused.contentType);
      if (validationError) throw new Error(validationError);
      return {
        blob,
        finalUrl: paused.request?.url || link.url,
        contentDisposition: paused.contentDisposition,
        sourceLink: link
      };
    } finally {
      if (paused?.requestId) {
        await sendDebuggerCommand(target, 'Fetch.failRequest', {
          requestId: paused.requestId,
          errorReason: 'Aborted'
        }).catch(() => {});
      }
      await sendDebuggerCommand(target, 'Fetch.disable', {}).catch(() => {});
      await detachDebugger(target);
    }
  };

  const executeMainWorld = (tabId, func, args = []) => new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args
    }, results => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(results?.[0]?.result);
    });
  });

  const fetchCnkiPdfFromPage = async (tabId, link, signal) => {
    const transferId = `wos-aide-${crypto.randomUUID()}`;
    const abortTransfer = () => {
      void executeMainWorld(tabId, id => {
        const transfer = window.__WOS_AIDE_CNKI_TRANSFERS__?.get(id);
        transfer?.controller?.abort();
        window.__WOS_AIDE_CNKI_TRANSFERS__?.delete(id);
      }, [transferId]).catch(() => {});
    };
    signal?.addEventListener('abort', abortTransfer, { once: true });
    try {
      const metadata = await executeMainWorld(tabId, async ({ id, url }) => {
        const transfers = window.__WOS_AIDE_CNKI_TRANSFERS__ ||= new Map();
        const controller = new AbortController();
        transfers.set(id, { controller });
        try {
          const response = await fetch(url, {
            credentials: 'include',
            redirect: 'follow',
            cache: 'no-store',
            referrer: location.href,
            referrerPolicy: 'strict-origin-when-cross-origin',
            headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
          const bytes = new Uint8Array(await response.arrayBuffer());
          const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
          if (!head.includes('%PDF-')) {
            const contentType = response.headers.get('content-type') || '';
            const verificationPage = /verifycode|captcha|verification|\u9a8c\u8bc1\u7801|\u9a57\u8b49\u78bc/i.test(head);
            const loginPage = /login|sign[ -]?in|\u767b\u5f55|\u767b\u9304/i.test(head);
            const reason = verificationPage
              ? 'CNKI returned a verification page; complete it in the article tab and retry.'
              : loginPage
                ? 'CNKI returned a login page; sign in again in the article tab and retry.'
                : `CNKI returned ${contentType || 'a non-PDF response'} instead of a PDF.`;
            throw new Error(reason);
          }
          transfers.set(id, { bytes });
          return {
            success: true,
            size: bytes.byteLength,
            contentType: response.headers.get('content-type') || '',
            contentDisposition: response.headers.get('content-disposition') || '',
            finalUrl: response.url
          };
        } catch (error) {
          transfers.delete(id);
          return { success: false, error: error?.message || String(error) };
        }
      }, [{ id: transferId, url: link.url }]);
      if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
      if (!metadata?.success) throw new Error(metadata?.error || 'CNKI page fetch failed.');

      const chunks = [];
      const chunkSize = 256 * 1024;
      for (let offset = 0; offset < metadata.size; offset += chunkSize) {
        if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
        const encoded = await executeMainWorld(tabId, ({ id, start, length }) => {
          const bytes = window.__WOS_AIDE_CNKI_TRANSFERS__?.get(id)?.bytes;
          if (!bytes) return '';
          const slice = bytes.subarray(start, Math.min(bytes.length, start + length));
          let binary = '';
          for (let index = 0; index < slice.length; index += 1) binary += String.fromCharCode(slice[index]);
          return btoa(binary);
        }, [{ id: transferId, start: offset, length: chunkSize }]);
        if (!encoded) throw new Error('The CNKI page transfer was interrupted.');
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        chunks.push(bytes);
      }
      const blob = new Blob(chunks, { type: metadata.contentType || 'application/pdf' });
      const validationError = await validatePdf(blob, metadata.contentType);
      if (validationError) throw new Error(validationError);
      return {
        blob,
        finalUrl: metadata.finalUrl,
        contentDisposition: metadata.contentDisposition
      };
    } finally {
      signal?.removeEventListener('abort', abortTransfer);
      await executeMainWorld(tabId, id => {
        window.__WOS_AIDE_CNKI_TRANSFERS__?.delete(id);
      }, [transferId]).catch(() => {});
    }
  };

  const refreshCnkiLink = async (tabId, previousLink) => {
    const response = await sendMessageWithBootstrap(tabId, { type: 'GET_CNKI_PDF_LINKS' });
    if (!response?.success || !Array.isArray(response.links)) return previousLink;
    const exactUrl = response.links.find(candidate => candidate.url === previousLink.url);
    const samePosition = response.links.find(candidate => candidate.position === previousLink.position);
    const sameTitle = response.links.find(candidate => candidate.title === previousLink.title);
    return exactUrl || samePosition || sameTitle || previousLink;
  };

  const fetchCnkiPdfWithRetry = async (tabId, originalLink, signal, onRetry) => {
    let currentLink = originalLink;
    let lastError = null;
    for (let attempt = 1; attempt <= CNKI_FETCH_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
      try {
        currentLink = await refreshCnkiLink(tabId, currentLink);
        const result = await fetchCnkiPdfFromPage(tabId, currentLink, signal);
        return { ...result, sourceLink: currentLink };
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = error;
        if (attempt >= CNKI_FETCH_ATTEMPTS) break;
        onRetry?.(attempt, error);
        await downloadDelay(CNKI_FETCH_RETRY_DELAYS[attempt - 1], signal);
      }
    }
    throw new Error(`${lastError?.message || lastError || 'CNKI transfer failed'} (${CNKI_FETCH_ATTEMPTS} attempts)`);
  };

  const searchChromeDownloads = query => new Promise((resolve, reject) => {
    if (!chrome.downloads?.search) {
      reject(new Error('Chrome Downloads access is unavailable. Reload the extension first.'));
      return;
    }
    chrome.downloads.search(query, items => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(Array.isArray(items) ? items : []);
    });
  });

  const downloadDelay = (milliseconds, signal) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Download stopped', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  const isRelatedCnkiDownload = (item, clickedAt, pageUrl) => {
    const startedAt = Date.parse(item?.startTime || '') || 0;
    if (startedAt < clickedAt - 500) return false;
    const urls = [item?.url, item?.finalUrl, item?.referrer, pageUrl].filter(Boolean);
    const hasCnkiUrl = urls.some(value => {
      try { return /(^|\.)cnki\.net$/i.test(new URL(value).hostname); } catch (_error) { return false; }
    });
    return hasCnkiUrl || /\.pdf(?:$|[?#])/i.test(String(item?.filename || item?.url || ''));
  };

  const waitForChromeDownloadCompletion = async ({ clickedAt, pageUrl, signal, onProgress }) => {
    const detectionDeadline = clickedAt + 30000;
    let downloadItem = null;
    while (!downloadItem && Date.now() < detectionDeadline) {
      if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
      const recent = await searchChromeDownloads({
        startedAfter: new Date(clickedAt - 500).toISOString(),
        orderBy: ['-startTime'],
        limit: 20
      });
      downloadItem = recent.find(item => isRelatedCnkiDownload(item, clickedAt, pageUrl)) || null;
      if (!downloadItem) await downloadDelay(500, signal);
    }
    if (!downloadItem) throw new Error('Chrome did not detect a download within 30 seconds.');

    const completionDeadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < completionDeadline) {
      if (signal?.aborted) throw new DOMException('Download stopped', 'AbortError');
      const [current] = await searchChromeDownloads({ id: downloadItem.id });
      if (!current) throw new Error('The Chrome download record disappeared.');
      onProgress?.(current);
      if (current.state === 'complete') return current;
      if (current.state === 'interrupted') {
        throw new Error(`Chrome download interrupted${current.error ? `: ${current.error}` : '.'}`);
      }
      await downloadDelay(700, signal);
    }
    throw new Error('The PDF download did not finish within 15 minutes.');
  };

  const scanCurrentTab = async ({ quiet = false } = {}) => {
    if (activeController) return;
    elements.refreshPageBtn.querySelector('i')?.classList.add('fa-spin');
    if (!quiet) setStatus('Scanning the active tab…', 'info');
    try {
      activeTab = await queryActiveTab();
      if (!activeTab?.id || !isCnkiUrl(activeTab.url)) {
        currentLinks = [];
        elements.pdfCount.textContent = '0';
        setStatus('Open a CNKI search-results page to use the downloader.', 'muted');
        setRunning(false);
        return;
      }
      const response = await sendMessageWithBootstrap(activeTab.id, { type: 'GET_CNKI_PDF_LINKS' });
      if (!response?.success) throw new Error(response?.error || 'CNKI page scan failed.');
      currentLinks = Array.isArray(response.links) ? response.links : [];
      elements.pdfCount.textContent = String(currentLinks.length);
      setStatus(
        `${currentLinks.length} unique PDF link${currentLinks.length === 1 ? '' : 's'} found on the current page.`,
        currentLinks.length ? 'success' : 'muted'
      );
      setRunning(false);
    } catch (error) {
      currentLinks = [];
      elements.pdfCount.textContent = '0';
      setStatus(error?.message || String(error), 'error');
      setRunning(false);
    } finally {
      elements.refreshPageBtn.querySelector('i')?.classList.remove('fa-spin');
    }
  };

  const openDirectoryDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('wos-aide-sidepanel', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const persistDirectoryHandle = async handle => {
    const database = await openDirectoryDatabase();
    await new Promise(resolve => {
      const transaction = database.transaction('handles', 'readwrite');
      transaction.objectStore('handles').put(handle, DIRECTORY_HANDLE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
  };

  const restoreDirectoryHandle = async () => {
    try {
      const database = await openDirectoryDatabase();
      return await new Promise(resolve => {
        const request = database.transaction('handles', 'readonly').objectStore('handles').get(DIRECTORY_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch (_error) {
      return null;
    }
  };

  const ensureDirectoryPermission = async (handle, requestPermission = false) => {
    if (!handle) return false;
    try {
      const options = { mode: 'readwrite' };
      if (await handle.queryPermission(options) === 'granted') return true;
      return requestPermission && await handle.requestPermission(options) === 'granted';
    } catch (_error) {
      return false;
    }
  };

  const chooseDirectory = async () => {
    if (!window.showDirectoryPicker) throw new Error('Folder selection is not supported by this Chrome version.');
    const handle = await window.showDirectoryPicker({ id: 'wos-aide-cnki-sidepanel', mode: 'readwrite' });
    if (!await ensureDirectoryPermission(handle, true)) throw new Error('Folder write permission was not granted.');
    directoryHandle = handle;
    showDirectoryName(handle);
    await persistDirectoryHandle(handle);
    log(`Selected existing-PDF comparison folder: ${handle.name}`);
  };

  const sha256Hex = async blob => {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const validatePdf = async (blob, contentType = '') => {
    if (/text\/html|application\/json/i.test(contentType)) return 'CNKI returned a web page instead of a PDF.';
    if (blob.size < 512) return `The response is too small (${blob.size} bytes).`;
    const decoder = new TextDecoder('latin1');
    const head = decoder.decode(await blob.slice(0, Math.min(blob.size, 1024)).arrayBuffer());
    if (!head.includes('%PDF-')) return 'The response does not contain a PDF signature.';
    const tail = decoder.decode(await blob.slice(Math.max(0, blob.size - 65536)).arrayBuffer());
    return tail.includes('%%EOF') ? '' : 'The PDF end marker is missing.';
  };

  const readIndex = async handle => {
    try {
      const file = await (await handle.getFileHandle(INDEX_FILE_NAME)).getFile();
      const parsed = JSON.parse(await file.text());
      return Array.isArray(parsed?.records) ? parsed.records : [];
    } catch (_error) {
      return [];
    }
  };

  const writeIndex = async (handle, records) => {
    const fileHandle = await handle.getFileHandle(INDEX_FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({
      version: 1,
      source: 'CNKI',
      algorithm: 'SHA-256',
      updatedAt: new Date().toISOString(),
      records: records.slice().sort((left, right) => left.filename.localeCompare(right.filename))
    }, null, 2));
    await writable.close();
  };

  const withDirectoryLock = (handle, scope, task) => runWithWebLock(
    navigator.locks,
    directoryLockName(handle?.name, `cnki-sidepanel:${scope}`),
    task,
    error => console.warn('[WOS Aide Side Panel] Web Lock unavailable:', error)
  );

  const synchronizeDirectory = async handle => withDirectoryLock(handle, 'index', async () => {
    const previous = await readIndex(handle);
    const previousByName = new Map(previous.map(record => [record.filename, record]));
    const records = [];
    const hashes = new Set();
    let duplicateCount = 0;
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !/\.pdf$/i.test(entry.name)) continue;
      const file = await entry.getFile();
      const cached = previousByName.get(entry.name);
      const unchanged = cached && cached.size === file.size && cached.lastModified === file.lastModified && cached.sha256;
      const sha256 = unchanged ? cached.sha256 : await sha256Hex(file);
      if (hashes.has(sha256)) {
        duplicateCount += 1;
        continue;
      }
      hashes.add(sha256);
      records.push({
        ...cached,
        filename: entry.name,
        size: file.size,
        lastModified: file.lastModified,
        sha256,
        source: cached?.source || 'local'
      });
    }
    await writeIndex(handle, records);
    return { records, hashes, duplicateCount };
  });

  const normalizeFileName = value => String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .toLocaleLowerCase();

  const downloadBaseName = value => {
    const segments = String(value || '').split(/[\\/]/);
    return segments[segments.length - 1] || '';
  };

  const prepareDirectoryDeduplication = async handle => {
    if (!skipExistingPdfs || !await ensureDirectoryPermission(handle, true)) return null;
    setStatus('Indexing the selected folder before downloading…', 'info');
    const synchronized = await synchronizeDirectory(handle);
    const records = synchronized.records.slice();
    return {
      handle,
      records,
      knownNames: new Set(records.map(record => normalizeFileName(record.filename)).filter(Boolean)),
      knownUrls: new Set(records.flatMap(record => [
        record.sourceUrl,
        ...(Array.isArray(record.duplicateSourceUrls) ? record.duplicateSourceUrls : [])
      ]).filter(Boolean))
    };
  };

  const linkExistsInDirectory = (deduplication, link) => {
    if (!deduplication) return false;
    if (deduplication.knownUrls.has(link.url)) return true;
    const expectedName = normalizeFileName(sanitizePdfFileName(link.title, `CNKI article ${link.position}`));
    return deduplication.knownNames.has(expectedName);
  };

  const indexCompletedPageDownload = async (deduplication, link, downloadItem) => {
    if (!deduplication) return false;
    const filename = downloadBaseName(downloadItem?.filename);
    if (!filename) return false;
    let file;
    try {
      file = await (await deduplication.handle.getFileHandle(filename)).getFile();
    } catch (_error) {
      return false;
    }
    const sha256 = await sha256Hex(file);
    const duplicate = deduplication.records.find(record => record.sha256 === sha256);
    if (duplicate && duplicate.filename !== filename) {
      duplicate.duplicateSourceUrls = Array.from(new Set([
        ...(Array.isArray(duplicate.duplicateSourceUrls) ? duplicate.duplicateSourceUrls : []),
        link.url
      ]));
    } else {
      const existing = deduplication.records.find(record => record.filename === filename);
      const record = {
        ...existing,
        filename,
        title: link.title,
        source: 'CNKI page click',
        sourceUrl: link.url,
        finalUrl: downloadItem.finalUrl || downloadItem.url || link.url,
        size: file.size,
        lastModified: file.lastModified,
        sha256,
        downloadedAt: new Date().toISOString()
      };
      if (existing) Object.assign(existing, record);
      else deduplication.records.push(record);
    }
    deduplication.knownNames.add(normalizeFileName(filename));
    deduplication.knownUrls.add(link.url);
    await withDirectoryLock(deduplication.handle, 'index', () => writeIndex(deduplication.handle, deduplication.records));
    return true;
  };

  const fileExists = async (handle, fileName) => {
    try {
      await handle.getFileHandle(fileName);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const uniqueFileName = async (handle, desiredName) => {
    if (!await fileExists(handle, desiredName)) return desiredName;
    const stem = desiredName.replace(/\.pdf$/i, '');
    for (let suffix = 2; suffix < 10000; suffix += 1) {
      const candidate = `${stem} (${suffix}).pdf`;
      if (!await fileExists(handle, candidate)) return candidate;
    }
    return `${stem}-${Date.now()}.pdf`;
  };

  const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Download stopped', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });

  const downloadCurrentPage = async () => {
    if (activeController) return;
    await scanCurrentTab({ quiet: true });
    if (!currentLinks.length) return;
    if (!directoryHandle) directoryHandle = await restoreDirectoryHandle();
    if (!await ensureDirectoryPermission(directoryHandle, true)) {
      setStatus('Choose or re-authorize the destination folder first.', 'error');
      return;
    }
    showDirectoryName(directoryHandle);
    activeController = new AbortController();
    setRunning(true);
    setProgress(0, currentLinks.length, `0/${currentLinks.length}`);
    let completed = 0;
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    try {
      setStatus('Synchronizing the selected folder…', 'info');
      const synchronized = await synchronizeDirectory(directoryHandle);
      const records = synchronized.records.slice();
      const knownHashes = synchronized.hashes;
      const knownUrls = new Set(records.flatMap(record => [
        record.sourceUrl,
        ...(Array.isArray(record.duplicateSourceUrls) ? record.duplicateSourceUrls : [])
      ]).filter(Boolean));
      if (synchronized.duplicateCount) log(`Folder index contains ${synchronized.duplicateCount} duplicate PDF file(s).`);
      setStatus(`Capturing ${currentLinks.length} authenticated page-click PDF(s) into the selected folder…`, 'info');
      for (const link of currentLinks) {
        if (activeController.signal.aborted) break;
        try {
          if (skipExistingPdfs && knownUrls.has(link.url)) {
            skipped += 1;
            log(`Skipped existing: ${link.title}`);
          } else {
            const { blob, finalUrl, contentDisposition, sourceLink } = await captureCnkiPdfWithTrustedClick(
              activeTab.id,
              link,
              activeController.signal
            );
            const sourceUrl = sourceLink?.url || link.url;
            const sha256 = await sha256Hex(blob);
            const duplicateRecord = skipExistingPdfs
              ? records.find(record => record.sha256 === sha256)
              : null;
            if (duplicateRecord) {
              skipped += 1;
              duplicateRecord.duplicateSourceUrls = Array.from(new Set([
                ...(Array.isArray(duplicateRecord.duplicateSourceUrls) ? duplicateRecord.duplicateSourceUrls : []),
                sourceUrl
              ]));
              knownUrls.add(link.url);
              knownUrls.add(sourceUrl);
              await withDirectoryLock(directoryHandle, 'index', () => writeIndex(directoryHandle, records));
              log(`Skipped duplicate content: ${link.title}`);
            } else {
              const headerName = fileNameFromContentDisposition(contentDisposition);
              const desiredName = sanitizePdfFileName(headerName || link.title, `CNKI article ${link.position}`);
              const fileName = await uniqueFileName(directoryHandle, desiredName);
              await withDirectoryLock(directoryHandle, `file:${fileName}`, async () => {
                const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
              });
              const savedFile = await (await directoryHandle.getFileHandle(fileName)).getFile();
              records.push({
                filename: fileName,
                title: link.title,
                source: 'CNKI',
                sourceUrl,
                finalUrl,
                size: savedFile.size,
                lastModified: savedFile.lastModified,
                sha256,
                downloadedAt: new Date().toISOString()
              });
              knownHashes.add(sha256);
              knownUrls.add(link.url);
              knownUrls.add(sourceUrl);
              await withDirectoryLock(directoryHandle, 'index', () => writeIndex(directoryHandle, records));
              downloaded += 1;
              log(`Saved: ${fileName}`);
            }
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          failed += 1;
          log(`Failed: ${link.title} — ${error?.message || error}`);
        }
        completed += 1;
        setProgress(completed, currentLinks.length);
        if (completed < currentLinks.length && downloadIntervalMs > 0) {
          await wait(downloadIntervalMs, activeController.signal);
        }
      }
      setStatus(`Finished: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`, failed ? 'error' : 'success');
      log(`Finished. Downloaded ${downloaded}, skipped ${skipped}, failed ${failed}.`);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Download stopped.', 'muted');
        log(`Stopped. Downloaded ${downloaded}, skipped ${skipped}, failed ${failed}.`);
      } else {
        setStatus(error?.message || String(error), 'error');
        log(`Download stopped: ${error?.message || error}`);
      }
    } finally {
      activeController = null;
      setRunning(false);
    }
  };

  const startPageClickDownloads = async () => {
    if (activeController) return;
    await scanCurrentTab({ quiet: true });
    if (!activeTab?.id || !currentLinks.length) return;
    if (!directoryHandle) directoryHandle = await restoreDirectoryHandle();
    const directoryGranted = directoryHandle && await ensureDirectoryPermission(directoryHandle, true);
    if (directoryHandle) showDirectoryName(directoryHandle, directoryGranted);
    if (directoryGranted) {
      setStatus('Selected-folder mode: capturing authenticated page-click PDFs directly into that folder.', 'info');
      await downloadCurrentPage();
      return;
    }
    activeController = new AbortController();
    setRunning(true);
    setProgress(0, currentLinks.length, `0/${currentLinks.length}`);
    let triggered = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const deduplication = directoryGranted
        ? await prepareDirectoryDeduplication(directoryHandle)
        : null;
      setStatus('Clicking CNKI PDF icons in the logged-in page. Chrome controls the download destination.', 'info');
      for (let index = 0; index < currentLinks.length; index += 1) {
        if (activeController.signal.aborted) break;
        const link = currentLinks[index];
        if (linkExistsInDirectory(deduplication, link)) {
          skipped += 1;
          log(`Skipped existing PDF: ${link.title}`);
          setProgress(index + 1, currentLinks.length, `${index + 1}/${currentLinks.length} · skipped`);
          continue;
        }
        try {
          const clickedAt = Date.now();
          const response = await triggerCnkiTrustedDownload(activeTab.id, link);
          if (!response?.success) throw new Error(response?.error || 'Trusted browser click failed.');
          log(`Trusted browser click triggered: ${link.title}`);
          const finished = await waitForChromeDownloadCompletion({
            clickedAt,
            pageUrl: activeTab.url,
            signal: activeController.signal,
            onProgress: item => {
              const totalBytes = Number(item.totalBytes) || 0;
              const receivedBytes = Number(item.bytesReceived) || 0;
              const bytePercent = totalBytes > 0 ? Math.min(100, Math.round(receivedBytes / totalBytes * 100)) : 0;
              const completedShare = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;
              setProgress(index + completedShare, currentLinks.length, `File ${index + 1}/${currentLinks.length}${totalBytes > 0 ? ` · ${bytePercent}%` : ' · downloading'}`);
            }
          });
          triggered += 1;
          try {
            await indexCompletedPageDownload(deduplication, link, finished);
          } catch (indexError) {
            console.warn('[WOS Aide] The completed CNKI download could not be indexed:', indexError);
          }
          log(`Trusted-click download completed: ${finished.filename || link.title}`);
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          failed += 1;
          log(`Trusted-click download failed: ${link.title} — ${error?.message || error}`);
        }
        setProgress(index + 1, currentLinks.length, `${index + 1}/${currentLinks.length} complete`);
        if (index + 1 < currentLinks.length && downloadIntervalMs > 0) {
          setProgress(index + 1, currentLinks.length, `${index + 1}/${currentLinks.length} · waiting ${downloadIntervalMs / 1000}s`);
          await downloadDelay(downloadIntervalMs, activeController.signal);
        }
      }
      setStatus(`Completed: ${triggered} downloaded, ${skipped} skipped, ${failed} failed.`, failed ? 'error' : 'success');
      log(`Completed. Downloaded ${triggered}, skipped ${skipped}, failed ${failed}.`);
    } catch (error) {
      if (error?.name === 'AbortError') setStatus('Trusted-click download sequence stopped.', 'muted');
      else setStatus(error?.message || String(error), 'error');
    } finally {
      activeController = null;
      setRunning(false);
    }
  };

  elements.refreshPageBtn.addEventListener('click', () => { void scanCurrentTab(); });
  elements.chooseFolderBtn.addEventListener('click', async () => {
    try {
      await chooseDirectory();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus(error?.message || String(error), 'error');
        log(error?.message || String(error));
      }
    }
  });
  elements.downloadBtn.addEventListener('click', () => { void startPageClickDownloads(); });
  elements.stopBtn.addEventListener('click', () => activeController?.abort());
  elements.downloadIntervalSeconds.addEventListener('change', () => {
    const seconds = Math.min(300, Math.max(0, Number(elements.downloadIntervalSeconds.value) || 0));
    downloadIntervalMs = Math.round(seconds * 1000);
    elements.downloadIntervalSeconds.value = String(seconds);
    chrome.storage.local.set({
      [DOWNLOAD_OPTIONS_KEY]: { downloadIntervalMs, skipExistingPdfs }
    });
  });
  elements.skipExistingPdfs.addEventListener('change', () => {
    skipExistingPdfs = elements.skipExistingPdfs.checked;
    chrome.storage.local.set({
      [DOWNLOAD_OPTIONS_KEY]: { downloadIntervalMs, skipExistingPdfs }
    });
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    removeLegacyDoiOverlay(tabId);
    if (!activeController) void scanCurrentTab({ quiet: true });
    if (document.getElementById('wosPanel')?.classList.contains('is-active')) refreshWosPanel();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!activeController && tab.active && (changeInfo.status === 'complete' || changeInfo.url)) {
      removeLegacyDoiOverlay(tabId);
      void scanCurrentTab({ quiet: true });
      if (document.getElementById('wosPanel')?.classList.contains('is-active')) refreshWosPanel();
    }
  });

  restoreDirectoryHandle().then(async handle => {
    if (!handle) return;
    directoryHandle = handle;
    const granted = await ensureDirectoryPermission(handle);
    showDirectoryName(handle, granted);
  });
  chrome.storage.local.get([DOWNLOAD_OPTIONS_KEY], result => {
    const saved = result[DOWNLOAD_OPTIONS_KEY] || {};
    const savedInterval = Number(saved.downloadIntervalMs);
    if (Number.isFinite(savedInterval)) downloadIntervalMs = Math.min(300000, Math.max(0, savedInterval));
    if (typeof saved.skipExistingPdfs === 'boolean') skipExistingPdfs = saved.skipExistingPdfs;
    elements.downloadIntervalSeconds.value = String(downloadIntervalMs / 1000);
    elements.skipExistingPdfs.checked = skipExistingPdfs;
  });
  queryActiveTab().then(tab => removeLegacyDoiOverlay(tab?.id));
  void scanCurrentTab();
})();
