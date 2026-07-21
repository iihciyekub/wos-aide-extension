const {
  collectCnkiPdfLinks,
  fileNameFromContentDisposition,
  sanitizePdfFileName
} = require('./cnki-pdf-links');
const { directoryLockName, runWithWebLock } = require('./pdf-tab-directory');

const getCnkiTabContextId = () => {
  const injected = String(globalThis.__WOS_AIDE_TAB_ID__ || '').trim();
  if (injected) return injected;
  const key = 'wos_aide_cnki_tab_context';
  try {
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, value);
    }
    return `session-${value}`;
  } catch (_error) {
    return `page-${Date.now()}`;
  }
};

(function initializeCnkiPdfDownloader() {
  const PANEL_ID = 'wos-aide-cnki-pdf-downloader';
  const STYLE_ID = 'wos-aide-cnki-pdf-downloader-style';
  const INDEX_FILE_NAME = 'cnki-pdf-download-index.json';
  const HANDLE_STORAGE_KEY = `cnki-pdf-download-tab:${getCnkiTabContextId()}`;
  const PICKER_ID = `wosAide-cnki-${getCnkiTabContextId().replace(/[^a-zA-Z0-9_-]/g, '').slice(-16)}`;
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.style.display = 'flex';
    existing.__wosAideScan?.();
    return;
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID} { position: fixed; z-index: 2147483646; top: 92px; right: 18px; width: 340px; max-height: calc(100vh - 110px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(36,55,72,.22); border-radius: 12px; background: #fdfaf4; color: #2b2a26; box-shadow: 0 16px 38px rgba(20,30,40,.2); font: 13px/1.45 Arial,"Microsoft YaHei",sans-serif; }
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .cnki-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#225b85; color:#fff; cursor:move; user-select:none; }
#${PANEL_ID} .cnki-head strong { font-size:13px; }
#${PANEL_ID} .cnki-close { border:0; background:transparent; color:#fff; font-size:20px; line-height:1; cursor:pointer; }
#${PANEL_ID} .cnki-body { display:flex; flex-direction:column; gap:9px; padding:12px; overflow:auto; }
#${PANEL_ID} .cnki-count { padding:9px 10px; border-radius:8px; background:#e8f1f7; color:#174b70; font-weight:700; }
#${PANEL_ID} .cnki-folder { color:#625e57; overflow-wrap:anywhere; }
#${PANEL_ID} .cnki-actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
#${PANEL_ID} button.cnki-button { min-height:34px; padding:7px 9px; border:1px solid rgba(34,91,133,.32); border-radius:8px; background:#fff; color:#234e70; cursor:pointer; }
#${PANEL_ID} button.cnki-button.primary { background:#225b85; color:#fff; }
#${PANEL_ID} button.cnki-button.danger { color:#a33d31; border-color:rgba(163,61,49,.35); }
#${PANEL_ID} button.cnki-button:disabled { opacity:.5; cursor:not-allowed; }
#${PANEL_ID} .cnki-progress { height:7px; overflow:hidden; border-radius:99px; background:#e3ded5; }
#${PANEL_ID} .cnki-progress > span { display:block; width:0; height:100%; background:#2f7c55; transition:width .16s ease; }
#${PANEL_ID} .cnki-log { min-height:74px; max-height:160px; overflow:auto; padding:8px; border:1px solid rgba(50,42,32,.13); border-radius:8px; background:#fff; color:#514c44; white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; }
`;
    document.documentElement.appendChild(style);
  }

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="cnki-head"><strong>CNKI Current-page PDF</strong><button class="cnki-close" title="Hide">×</button></div>
    <div class="cnki-body">
      <div class="cnki-count">Scanning current page…</div>
      <div class="cnki-folder">Folder: not selected</div>
      <div class="cnki-actions">
        <button class="cnki-button cnki-scan">Scan Page</button>
        <button class="cnki-button cnki-folder-button">Choose Folder</button>
        <button class="cnki-button primary cnki-download">Download Current Page</button>
        <button class="cnki-button danger cnki-stop" disabled>Stop</button>
      </div>
      <div class="cnki-progress"><span></span></div>
      <div class="cnki-log" role="status">Ready. Only visible results on this page will be processed.</div>
    </div>`;
  document.documentElement.appendChild(panel);

  const countElement = panel.querySelector('.cnki-count');
  const folderElement = panel.querySelector('.cnki-folder');
  const scanButton = panel.querySelector('.cnki-scan');
  const folderButton = panel.querySelector('.cnki-folder-button');
  const downloadButton = panel.querySelector('.cnki-download');
  const stopButton = panel.querySelector('.cnki-stop');
  const progressBar = panel.querySelector('.cnki-progress > span');
  const logElement = panel.querySelector('.cnki-log');
  let links = [];
  let directoryHandle = null;
  let controller = null;
  let scanTimer = null;

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logElement.textContent = `[${timestamp}] ${message}\n${logElement.textContent}`.slice(0, 6000);
  };

  const setRunning = (running) => {
    scanButton.disabled = running;
    folderButton.disabled = running;
    downloadButton.disabled = running || links.length === 0;
    stopButton.disabled = !running;
  };

  const scanPage = () => {
    links = collectCnkiPdfLinks(document, location.href);
    countElement.textContent = `${links.length} unique PDF download link${links.length === 1 ? '' : 's'} found on this page`;
    if (!controller) downloadButton.disabled = links.length === 0;
    document.dispatchEvent(new CustomEvent('__CNKI_PDF_LINK_COUNT_CHANGED__', {
      detail: { count: links.length }
    }));
    return links;
  };
  panel.__wosAideScan = scanPage;

  const openHandleStore = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('wosaide-toolkit', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('projectHandles')) {
        request.result.createObjectStore('projectHandles');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const storeDirectoryHandle = async (handle) => {
    const database = await openHandleStore();
    await new Promise(resolve => {
      const transaction = database.transaction('projectHandles', 'readwrite');
      transaction.objectStore('projectHandles').put(handle, HANDLE_STORAGE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
  };

  const loadDirectoryHandle = async () => {
    try {
      const database = await openHandleStore();
      return await new Promise(resolve => {
        const request = database.transaction('projectHandles', 'readonly')
          .objectStore('projectHandles').get(HANDLE_STORAGE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch (_error) {
      return null;
    }
  };

  const ensureDirectoryPermission = async (handle, requestIfNeeded = false) => {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    try {
      if (await handle.queryPermission(options) === 'granted') return true;
      return requestIfNeeded && await handle.requestPermission(options) === 'granted';
    } catch (_error) {
      return false;
    }
  };

  const chooseDirectory = async () => {
    if (!window.showDirectoryPicker) throw new Error('This Chrome version does not support folder selection.');
    const handle = await window.showDirectoryPicker({ id: PICKER_ID, mode: 'readwrite' });
    if (!await ensureDirectoryPermission(handle, true)) throw new Error('Folder write permission was not granted.');
    directoryHandle = handle;
    await storeDirectoryHandle(handle);
    folderElement.textContent = `Folder: ${handle.name}`;
    log(`Selected folder: ${handle.name}`);
    return handle;
  };

  const sha256Hex = async (blob) => {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const validatePdf = async (blob, contentType = '') => {
    if (/text\/html|application\/json/i.test(contentType)) return 'The server returned a web page instead of a PDF.';
    if (blob.size < 512) return `The response is too small (${blob.size} bytes).`;
    const decoder = new TextDecoder('latin1');
    const head = decoder.decode(await blob.slice(0, Math.min(blob.size, 1024)).arrayBuffer());
    if (!head.includes('%PDF-')) return 'The response does not contain a PDF signature.';
    const tail = decoder.decode(await blob.slice(Math.max(0, blob.size - 65536)).arrayBuffer());
    return tail.includes('%%EOF') ? '' : 'The PDF end marker is missing.';
  };

  const readIndex = async (handle) => {
    try {
      const file = await (await handle.getFileHandle(INDEX_FILE_NAME)).getFile();
      const parsed = JSON.parse(await file.text());
      return Array.isArray(parsed?.records) ? parsed.records : [];
    } catch (_error) {
      return [];
    }
  };

  const writeIndex = async (handle, records) => {
    const indexHandle = await handle.getFileHandle(INDEX_FILE_NAME, { create: true });
    const writable = await indexHandle.createWritable();
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
    directoryLockName(handle?.name, `cnki:${scope}`),
    task,
    error => console.warn('[WOS Aide CNKI] Web Lock unavailable:', error)
  );

  const synchronizeDirectory = async (handle) => withDirectoryLock(handle, 'index', async () => {
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
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Download stopped', 'AbortError'));
    }, { once: true });
  });

  const downloadCurrentPage = async () => {
    if (controller) return;
    scanPage();
    if (!links.length) {
      log('No CNKI PDF download links were found on the current page.');
      return;
    }
    if (!directoryHandle) directoryHandle = await loadDirectoryHandle();
    if (!await ensureDirectoryPermission(directoryHandle, true)) {
      log('Choose the destination folder before downloading.');
      return;
    }
    folderElement.textContent = `Folder: ${directoryHandle.name}`;
    controller = new AbortController();
    setRunning(true);
    progressBar.style.width = '0%';
    let completed = 0;
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const synchronized = await synchronizeDirectory(directoryHandle);
      const records = synchronized.records.slice();
      const knownHashes = synchronized.hashes;
      const knownUrls = new Set(records.flatMap(record => [
        record.sourceUrl,
        ...(Array.isArray(record.duplicateSourceUrls) ? record.duplicateSourceUrls : [])
      ]).filter(Boolean));
      if (synchronized.duplicateCount) log(`Folder scan found ${synchronized.duplicateCount} duplicate PDF file(s).`);
      log(`Starting ${links.length} current-page download(s) in serial mode.`);
      for (const link of links) {
        if (controller.signal.aborted) break;
        try {
          if (knownUrls.has(link.url)) {
            skipped += 1;
            log(`Skipped existing: ${link.title}`);
          } else {
            const response = await fetch(link.url, {
              credentials: 'include',
              redirect: 'follow',
              signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const validationError = await validatePdf(blob, response.headers.get('content-type') || blob.type);
            if (validationError) throw new Error(validationError);
            const sha256 = await sha256Hex(blob);
            if (knownHashes.has(sha256)) {
              skipped += 1;
              knownUrls.add(link.url);
              const matchingRecord = records.find(record => record.sha256 === sha256);
              if (matchingRecord) {
                matchingRecord.duplicateSourceUrls = Array.from(new Set([
                  ...(Array.isArray(matchingRecord.duplicateSourceUrls) ? matchingRecord.duplicateSourceUrls : []),
                  link.url
                ]));
                await withDirectoryLock(directoryHandle, 'index', () => writeIndex(directoryHandle, records));
              }
              log(`Skipped duplicate content: ${link.title}`);
            } else {
              const headerName = fileNameFromContentDisposition(response.headers.get('content-disposition'));
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
                sourceUrl: link.url,
                finalUrl: response.url,
                size: savedFile.size,
                lastModified: savedFile.lastModified,
                sha256,
                downloadedAt: new Date().toISOString()
              });
              knownHashes.add(sha256);
              knownUrls.add(link.url);
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
        progressBar.style.width = `${Math.round(completed / links.length * 100)}%`;
        if (completed < links.length) await wait(800, controller.signal);
      }
      log(`Finished. Downloaded ${downloaded}, skipped ${skipped}, failed ${failed}.`);
    } catch (error) {
      if (error?.name === 'AbortError') log(`Stopped. Downloaded ${downloaded}, skipped ${skipped}, failed ${failed}.`);
      else log(`Download stopped: ${error?.message || error}`);
    } finally {
      controller = null;
      setRunning(false);
    }
  };

  scanButton.addEventListener('click', () => {
    scanPage();
    log(`Scan complete: ${links.length} unique PDF link(s).`);
  });
  folderButton.addEventListener('click', async () => {
    try {
      await chooseDirectory();
    } catch (error) {
      if (error?.name !== 'AbortError') log(error?.message || String(error));
    }
  });
  downloadButton.addEventListener('click', () => { void downloadCurrentPage(); });
  stopButton.addEventListener('click', () => controller?.abort());
  panel.querySelector('.cnki-close').addEventListener('click', () => {
    panel.style.display = 'none';
    document.dispatchEvent(new CustomEvent('__CNKI_PDF_DOWNLOAD_VISIBILITY__', { detail: { visible: false } }));
  });

  const header = panel.querySelector('.cnki-head');
  header.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const move = moveEvent => {
      panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, moveEvent.clientX - offsetX))}px`;
      panel.style.top = `${Math.max(8, Math.min(innerHeight - 80, moveEvent.clientY - offsetY))}px`;
      panel.style.right = 'auto';
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  });

  document.addEventListener('__CNKI_PDF_DOWNLOAD_VISIBILITY__', event => {
    if (typeof event.detail?.visible !== 'boolean') return;
    panel.style.display = event.detail.visible ? 'flex' : 'none';
    if (event.detail.visible) scanPage();
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.every(mutation => panel.contains(mutation.target))) return;
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, 250);
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  loadDirectoryHandle().then(async handle => {
    if (!handle) return;
    directoryHandle = handle;
    folderElement.textContent = await ensureDirectoryPermission(handle)
      ? `Folder: ${handle.name}`
      : `Folder: ${handle.name} (permission required)`;
  });
  scanPage();
})();
