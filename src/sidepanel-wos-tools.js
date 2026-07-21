'use strict';

const UUID_PATTERN = /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/;
const WOS_ID_PATTERN = /\bWOS:[A-Z0-9]{10,}\b/gi;
const DOI_PATTERN = /\b(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*|urn:\s*doi:\s*)?(10\.\d{4,9}\/[^\s"'<>()\[\],;]+)/gi;
const WOS_HOST_PATTERN = /(^|\.)webofscience\.com$|(^|\.)webofknowledge\.com$|(^|\.)isiknowledge\.com$/i;

const isWosUrl = value => {
  try {
    return WOS_HOST_PATTERN.test(new URL(value || '').hostname);
  } catch (_error) {
    return false;
  }
};

const extractIdentifiers = value => {
  const source = String(value || '');
  const wosids = [];
  const matchedWosIds = [];
  let match;
  WOS_ID_PATTERN.lastIndex = 0;
  while ((match = WOS_ID_PATTERN.exec(source)) !== null) {
    const normalized = match[0].toUpperCase();
    wosids.push(normalized);
    matchedWosIds.push(match[0]);
  }
  let remaining = source;
  matchedWosIds.forEach(id => { remaining = remaining.replace(id, ' '); });
  const dois = [];
  DOI_PATTERN.lastIndex = 0;
  while ((match = DOI_PATTERN.exec(remaining)) !== null) {
    let doi = match[1] || match[0];
    try { doi = decodeURIComponent(doi); } catch (_error) { /* keep source text */ }
    doi = doi.replace(/[.,;:)\]}]+$/g, '').trim().toLowerCase();
    if (doi) dois.push(doi);
  }
  return {
    wosids: Array.from(new Set(wosids)),
    dois: Array.from(new Set(dois))
  };
};

const queryActiveTab = () => new Promise(resolve => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] || null));
});

const executeMain = (tabId, func, args = []) => new Promise((resolve, reject) => {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func,
    args
  }, results => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    resolve(results?.[0]?.result);
  });
});

const openHandleDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('wos-aide-sidepanel', 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('handles')) request.result.createObjectStore('handles');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const persistHandle = async (key, handle) => {
  const database = await openHandleDatabase();
  await new Promise(resolve => {
    const transaction = database.transaction('handles', 'readwrite');
    transaction.objectStore('handles').put(handle, key);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
};

const restoreHandle = async key => {
  try {
    const database = await openHandleDatabase();
    return await new Promise(resolve => {
      const request = database.transaction('handles', 'readonly').objectStore('handles').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (_error) {
    return null;
  }
};

const hasWritePermission = async (handle, requestPermission = false) => {
  if (!handle) return false;
  try {
    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return true;
    return requestPermission && await handle.requestPermission(options) === 'granted';
  } catch (_error) {
    return false;
  }
};

const writeTextFile = async (directory, fileName, data) => {
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(String(data));
  await writable.close();
};

const sendRuntimeMessage = message => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(message, response => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (!response?.success) reject(new Error(response?.error || 'Request failed.'));
    else resolve(response);
  });
});

function initializeWosSidePanelTools() {
  const elements = {
    doiTab: document.getElementById('wosDoiToolTab'),
    uuidTab: document.getElementById('wosUuidToolTab'),
    doiPanel: document.getElementById('wosDoiToolPanel'),
    uuidPanel: document.getElementById('wosUuidToolPanel'),
    doiInput: document.getElementById('wosDoiQueryInput'),
    doiCount: document.getElementById('wosDoiCount'),
    wosIdCount: document.getElementById('wosIdCount'),
    normalizeBtn: document.getElementById('normalizeWosDoiBtn'),
    doiSearchBtn: document.getElementById('runWosDoiSearchBtn'),
    doiStatus: document.getElementById('wosDoiToolStatus'),
    uuidInput: document.getElementById('wosUuidInput'),
    uuidInfo: document.getElementById('wosUuidInfo'),
    refreshUuidBtn: document.getElementById('refreshWosUuidBtn'),
    openUuidBtn: document.getElementById('openWosUuidPageBtn'),
    chooseFolderBtn: document.getElementById('chooseWosExportFolderBtn'),
    folderName: document.getElementById('wosExportFolderName'),
    format: document.getElementById('wosExportFormat'),
    exportBtn: document.getElementById('runWosUuidExportBtn'),
    exportBar: document.getElementById('wosExportProgressBar'),
    exportStatus: document.getElementById('wosExportStatus'),
    scholarInput: document.getElementById('scholarJournalInput'),
    scholarSearchBtn: document.getElementById('searchScholarRankBtn'),
    scholarOpenBtn: document.getElementById('openScholarSoBtn'),
    scholarPickBtn: document.getElementById('pickScholarJournalBtn'),
    scholarStatus: document.getElementById('scholarQueryStatus'),
    scholarResults: document.getElementById('scholarRankResults')
  };
  if (!elements.doiPanel || !elements.scholarInput) return;

  const DIRECTORY_KEY = 'wos-uuid-export-directory';
  let exportDirectory = null;
  let connectedWosTab = null;
  let exportRunning = false;

  const setToolPanel = panel => {
    const isDoi = panel === 'doi';
    elements.doiTab.classList.toggle('is-active', isDoi);
    elements.uuidTab.classList.toggle('is-active', !isDoi);
    elements.doiTab.setAttribute('aria-selected', String(isDoi));
    elements.uuidTab.setAttribute('aria-selected', String(!isDoi));
    elements.doiPanel.hidden = !isDoi;
    elements.uuidPanel.hidden = isDoi;
    chrome.storage.local.set({ wosAideWosTool: panel });
    if (!isDoi) void refreshUuid();
  };

  const updateIdentifierCounts = ({ normalize = false } = {}) => {
    const extracted = extractIdentifiers(elements.doiInput.value);
    elements.doiCount.textContent = String(extracted.dois.length);
    elements.wosIdCount.textContent = String(extracted.wosids.length);
    if (normalize) elements.doiInput.value = [...extracted.wosids, ...extracted.dois].join('\n');
    elements.doiSearchBtn.disabled = !(connectedWosTab?.id && (extracted.dois.length || extracted.wosids.length));
    return extracted;
  };

  const updateExportAvailability = () => {
    const uuid = String(elements.uuidInput.value || '').match(UUID_PATTERN)?.[0] || '';
    elements.exportBtn.disabled = exportRunning || !connectedWosTab?.id || !exportDirectory || !uuid;
  };

  const prepareWosPageBridge = async tabId => {
    if (!tabId) return;
    await executeMain(tabId, () => {
      window.__WOS_AIDE_WAIT_FOR_WOS__ = async () => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          if (window.wos?.uuid && typeof window.wos.query_wosid_or_doi === 'function') return window.wos;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('WOS page API is not ready. Reload the WOS page and try again.');
      };
      try {
        ['clipboard-reader-box', 'wos_easyscholar_panel', 'wos_openai_panel', 'wos-aide-toolbar-shortcuts'].forEach(id => {
          document.getElementById(id)?.remove();
        });
      } catch (_error) { /* page cleanup is best effort */ }
      return true;
    });
  };

  const refreshConnection = async () => {
    const tab = await queryActiveTab();
    connectedWosTab = tab?.id && isWosUrl(tab.url) ? tab : null;
    if (connectedWosTab) {
      try {
        await prepareWosPageBridge(connectedWosTab.id);
        elements.doiStatus.textContent = 'Ready to search in the current WOS session.';
        elements.doiStatus.className = 'helper status--success';
      } catch (error) {
        connectedWosTab = null;
        elements.doiStatus.textContent = error?.message || String(error);
        elements.doiStatus.className = 'helper status--error';
      }
    } else {
      elements.doiStatus.textContent = 'Open a Web of Science page first.';
      elements.doiStatus.className = 'helper status--error';
    }
    updateIdentifierCounts();
    updateExportAvailability();
    return connectedWosTab;
  };

  const refreshUuid = async () => {
    const tab = await refreshConnection();
    if (!tab) {
      elements.uuidInfo.textContent = 'Open a Web of Science result page first.';
      elements.uuidInfo.className = 'helper status--error';
      return '';
    }
    elements.refreshUuidBtn.querySelector('i')?.classList.add('fa-spin');
    try {
      const state = await executeMain(tab.id, async () => {
        await window.__WOS_AIDE_WAIT_FOR_WOS__();
        const match = String(location.href).match(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/);
        let info = null;
        if (match && window.wos?.uuid?.info) {
          try { info = await window.wos.uuid.info(); } catch (_error) { /* URL is still useful */ }
        }
        return { uuid: match?.[0] || info?.uuid || '', count: info?.ref_count || '' };
      });
      if (state?.uuid) {
        elements.uuidInput.value = state.uuid;
        elements.uuidInfo.textContent = state.count
          ? `Current UUID · ${String(state.count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} records`
          : 'Current UUID detected.';
        elements.uuidInfo.className = 'helper status--success';
      } else {
        elements.uuidInfo.textContent = 'No UUID detected on the current WOS page.';
        elements.uuidInfo.className = 'helper status--muted';
      }
    } catch (error) {
      elements.uuidInfo.textContent = error?.message || String(error);
      elements.uuidInfo.className = 'helper status--error';
    } finally {
      elements.refreshUuidBtn.querySelector('i')?.classList.remove('fa-spin');
      updateExportAvailability();
    }
    return elements.uuidInput.value;
  };

  const renderScholarResults = result => {
    elements.scholarResults.replaceChildren();
    const entries = Object.entries(result || {});
    if (!entries.length) {
      elements.scholarResults.hidden = true;
      return;
    }
    entries.forEach(([label, value]) => {
      const row = document.createElement('div');
      const key = document.createElement('span');
      const rank = document.createElement('strong');
      key.textContent = label;
      rank.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      row.append(key, rank);
      elements.scholarResults.appendChild(row);
    });
    elements.scholarResults.hidden = false;
  };

  elements.doiTab.addEventListener('click', () => setToolPanel('doi'));
  elements.uuidTab.addEventListener('click', () => setToolPanel('uuid'));
  elements.doiInput.addEventListener('input', () => updateIdentifierCounts());
  elements.normalizeBtn.addEventListener('click', () => updateIdentifierCounts({ normalize: true }));
  elements.doiSearchBtn.addEventListener('click', async () => {
    const tab = await refreshConnection();
    const extracted = updateIdentifierCounts({ normalize: true });
    if (!tab || (!extracted.wosids.length && !extracted.dois.length)) return;
    elements.doiSearchBtn.disabled = true;
    elements.doiStatus.textContent = 'Opening the combined query in WOS…';
    elements.doiStatus.className = 'helper status--info';
    try {
      await executeMain(tab.id, async (wosids, dois) => {
        const api = await window.__WOS_AIDE_WAIT_FOR_WOS__();
        return api.query_wosid_or_doi(wosids, dois);
      }, [extracted.wosids, extracted.dois]);
      elements.doiStatus.textContent = `Opened ${extracted.dois.length} DOI and ${extracted.wosids.length} WOS ID in WOS.`;
      elements.doiStatus.className = 'helper status--success';
    } catch (error) {
      elements.doiStatus.textContent = error?.message || String(error);
      elements.doiStatus.className = 'helper status--error';
    } finally {
      updateIdentifierCounts();
    }
  });

  elements.refreshUuidBtn.addEventListener('click', () => { void refreshUuid(); });
  elements.uuidInput.addEventListener('input', updateExportAvailability);
  elements.openUuidBtn.addEventListener('click', async () => {
    const tab = await refreshConnection();
    const uuid = String(elements.uuidInput.value || '').match(UUID_PATTERN)?.[0] || '';
    if (!tab || !uuid) {
      elements.uuidInfo.textContent = 'Enter a valid UUID and open a WOS page first.';
      elements.uuidInfo.className = 'helper status--error';
      return;
    }
    elements.openUuidBtn.disabled = true;
    elements.uuidInfo.textContent = 'Opening UUID result page…';
    try {
      await executeMain(tab.id, async value => {
        const api = await window.__WOS_AIDE_WAIT_FOR_WOS__();
        await api.uuid.open(value);
        return true;
      }, [uuid]);
      await refreshUuid();
    } catch (error) {
      elements.uuidInfo.textContent = error?.message || String(error);
      elements.uuidInfo.className = 'helper status--error';
    } finally {
      elements.openUuidBtn.disabled = false;
    }
  });

  elements.chooseFolderBtn.addEventListener('click', async () => {
    try {
      if (!window.showDirectoryPicker) throw new Error('This Chrome version does not support folder selection.');
      const handle = await window.showDirectoryPicker({ id: 'wos-aide-wos-export', mode: 'readwrite' });
      if (!await hasWritePermission(handle, true)) throw new Error('Folder write permission was not granted.');
      exportDirectory = handle;
      elements.folderName.textContent = handle.name || 'Selected folder';
      await persistHandle(DIRECTORY_KEY, handle);
      elements.exportStatus.textContent = 'Folder selected. Ready to export.';
      elements.exportStatus.className = 'helper status--success';
    } catch (error) {
      if (error?.name !== 'AbortError') {
        elements.exportStatus.textContent = error?.message || String(error);
        elements.exportStatus.className = 'helper status--error';
      }
    } finally {
      updateExportAvailability();
    }
  });

  elements.exportBtn.addEventListener('click', async () => {
    if (exportRunning) return;
    const tab = await refreshConnection();
    const uuid = String(elements.uuidInput.value || '').match(UUID_PATTERN)?.[0] || '';
    if (!tab || !uuid || !await hasWritePermission(exportDirectory, true)) {
      elements.exportStatus.textContent = 'Open the UUID page and choose an authorized export folder first.';
      elements.exportStatus.className = 'helper status--error';
      return;
    }
    exportRunning = true;
    updateExportAvailability();
    elements.exportBar.style.width = '0%';
    const format = elements.format.value === 'bib' ? 'bib' : 'txt';
    try {
      const currentUuid = await executeMain(tab.id, async value => {
        const api = await window.__WOS_AIDE_WAIT_FOR_WOS__();
        const current = String(location.href).match(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/)?.[0] || '';
        if (current !== value) await api.uuid.open(value);
        const info = await api.uuid.info();
        return { uuid: info?.uuid || value, count: info?.ref_count || 0, status: info?.status || '' };
      }, [uuid]);
      const totalRecords = Number.parseInt(String(currentUuid?.count || '0').replace(/,/g, ''), 10) || 0;
      if (!totalRecords || currentUuid?.status === 'failed') throw new Error('WOS did not return a record count for this UUID.');
      const totalBatches = Math.ceil(totalRecords / 500);
      for (let batch = 0; batch < totalBatches; batch += 1) {
        const markFrom = batch * 500 + 1;
        const markTo = Math.min(markFrom + 499, totalRecords);
        elements.exportStatus.textContent = `Exporting batch ${batch + 1}/${totalBatches} · records ${markFrom}-${markTo}`;
        elements.exportStatus.className = 'helper status--info';
        const result = await executeMain(tab.id, async (from, to, selectedFormat) => {
          const api = await window.__WOS_AIDE_WAIT_FOR_WOS__();
          if (typeof api.uuid.export_range_data !== 'function') {
            throw new Error('Reload the WOS page once to activate the updated exporter.');
          }
          return api.uuid.export_range_data(from, to, selectedFormat);
        }, [markFrom, markTo, format]);
        const fileName = `${result.uuid}_${result.markFrom}_${result.markTo}.${format}`;
        await writeTextFile(exportDirectory, fileName, result.data);
        elements.exportBar.style.width = `${Math.round((batch + 1) / totalBatches * 100)}%`;
      }
      elements.exportStatus.textContent = `Export complete · ${totalRecords} records · ${totalBatches} ${format.toUpperCase()} file(s)`;
      elements.exportStatus.className = 'helper status--success';
    } catch (error) {
      elements.exportStatus.textContent = error?.message || String(error);
      elements.exportStatus.className = 'helper status--error';
    } finally {
      exportRunning = false;
      updateExportAvailability();
    }
  });

  elements.scholarSearchBtn.addEventListener('click', async () => {
    const journal = elements.scholarInput.value.trim();
    if (!journal) {
      elements.scholarStatus.textContent = 'Enter a journal title first.';
      elements.scholarStatus.className = 'helper status--error';
      return;
    }
    elements.scholarSearchBtn.disabled = true;
    elements.scholarStatus.textContent = `Querying ${journal}…`;
    elements.scholarStatus.className = 'helper status--info';
    try {
      const response = await sendRuntimeMessage({ type: 'FETCH_EASYSCHOLAR_RANK', publicationName: journal });
      renderScholarResults(response.result);
      elements.scholarStatus.textContent = 'Journal ranking loaded.';
      elements.scholarStatus.className = 'helper status--success';
    } catch (error) {
      renderScholarResults(null);
      elements.scholarStatus.textContent = error?.message || String(error);
      elements.scholarStatus.className = 'helper status--error';
    } finally {
      elements.scholarSearchBtn.disabled = false;
    }
  });

  elements.scholarOpenBtn.addEventListener('click', async () => {
    const journal = elements.scholarInput.value.trim();
    const tab = await refreshConnection();
    if (!journal || !tab) {
      elements.scholarStatus.textContent = 'Enter a journal title and open a WOS page first.';
      elements.scholarStatus.className = 'helper status--error';
      return;
    }
    try {
      await executeMain(tab.id, async value => {
        const api = await window.__WOS_AIDE_WAIT_FOR_WOS__();
        await api.query(`SO=${value}`);
        return true;
      }, [journal]);
      elements.scholarStatus.textContent = 'SO search opened in WOS.';
      elements.scholarStatus.className = 'helper status--success';
    } catch (error) {
      elements.scholarStatus.textContent = error?.message || String(error);
      elements.scholarStatus.className = 'helper status--error';
    }
  });

  elements.scholarPickBtn.addEventListener('click', async () => {
    const tab = await refreshConnection();
    if (!tab) {
      elements.scholarStatus.textContent = 'Open a WOS record page first.';
      elements.scholarStatus.className = 'helper status--error';
      return;
    }
    elements.scholarPickBtn.disabled = true;
    elements.scholarStatus.textContent = 'Click the journal title on the WOS page. Press Esc to cancel.';
    elements.scholarStatus.className = 'helper status--info';
    try {
      const selected = await executeMain(tab.id, () => new Promise((resolve, reject) => {
        let highlighted = null;
        const previousOutline = new WeakMap();
        const cleanup = () => {
          document.removeEventListener('mouseover', onMouseOver, true);
          document.removeEventListener('click', onClick, true);
          document.removeEventListener('keydown', onKeyDown, true);
          if (highlighted) highlighted.style.outline = previousOutline.get(highlighted) || '';
          clearTimeout(timeout);
        };
        const textFor = target => String(
          target?.closest?.('a, button, [data-ta], span, div')?.textContent || target?.textContent || ''
        ).replace(/\s+/g, ' ').trim().slice(0, 300);
        const onMouseOver = event => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) return;
          if (highlighted) highlighted.style.outline = previousOutline.get(highlighted) || '';
          highlighted = target;
          previousOutline.set(target, target.style.outline);
          target.style.outline = '2px solid #202123';
        };
        const onClick = event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const value = textFor(event.target);
          cleanup();
          if (value) resolve(value);
          else reject(new Error('No text was found in the selected element.'));
        };
        const onKeyDown = event => {
          if (event.key !== 'Escape') return;
          cleanup();
          reject(new Error('Journal picking cancelled.'));
        };
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Journal picking timed out.'));
        }, 30000);
      }));
      elements.scholarInput.value = selected || '';
      elements.scholarStatus.textContent = selected ? 'Journal text captured from WOS.' : 'Nothing was selected.';
      elements.scholarStatus.className = selected ? 'helper status--success' : 'helper status--muted';
    } catch (error) {
      elements.scholarStatus.textContent = error?.message || String(error);
      elements.scholarStatus.className = 'helper status--error';
    } finally {
      elements.scholarPickBtn.disabled = false;
    }
  });

  chrome.storage.local.get(['wosAideWosTool'], result => setToolPanel(result.wosAideWosTool === 'uuid' ? 'uuid' : 'doi'));
  restoreHandle(DIRECTORY_KEY).then(async handle => {
    if (!handle) return;
    exportDirectory = handle;
    const granted = await hasWritePermission(handle);
    elements.folderName.textContent = `${handle.name || 'Selected folder'}${granted ? '' : ' (permission required)'}`;
    updateExportAvailability();
  });
  chrome.tabs.onActivated.addListener(() => { void refreshConnection(); });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.status === 'complete' || changeInfo.url)) void refreshConnection();
  });
  window.addEventListener('wos-aide:wos-tab-activated', async () => {
    await refreshConnection();
    if (elements.uuidTab.classList.contains('is-active')) await refreshUuid();
  });
  void refreshConnection();
}

module.exports = {
  extractIdentifiers,
  initializeWosSidePanelTools
};
