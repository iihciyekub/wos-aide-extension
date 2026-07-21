'use strict';

import './popup.css';
const { classifyWosHost } = require('./wos-host');
const { resolveWosSidInMainWorld } = require('./wos-sid-main-world');

(function() {
  const CHAT_API_KEY_STORAGE_KEY = 'wosOpenaiApiKey';
  const CHAT_MODEL_STORAGE_KEY = 'wosOpenaiChatModel';
  const WOS_QUERY_PROVIDER_STORAGE_KEY = 'wosQueryProvider';
  const WOS_QUERY_ENABLED_STORAGE_KEY = 'wosQueryEnabled';
  const WOS_QUERY_OPENAI_VERIFIED_STORAGE_KEY = 'wosOpenaiVerified';
  const WOS_QUERY_LMSTUDIO_VERIFIED_STORAGE_KEY = 'wosLmStudioVerified';
  const LM_STUDIO_BASE_URL_STORAGE_KEY = 'wosLmStudioBaseUrl';
  const LM_STUDIO_MODEL_STORAGE_KEY = 'wosLmStudioModel';
  const LM_STUDIO_API_KEY_STORAGE_KEY = 'wosLmStudioApiKey';
  const EASYSCHOLAR_API_KEY_STORAGE_KEY = 'wos-easyscholar-api-key';
  const EASYSCHOLAR_API_KEY_VERIFIED_STORAGE_KEY = 'wos-easyscholar-api-key-verified';
  const EASYSCHOLAR_ENABLED_STORAGE_KEY = 'easyscholarEnabled';
  const OPENAI_SETTINGS_COLLAPSED_KEY = 'wosOpenaiSettingsCollapsed';
  const EASYSCHOLAR_SETTINGS_COLLAPSED_KEY = 'wosEasyScholarSettingsCollapsed';
  const EASYSCHOLAR_API_KEY_SYNC_EVENT = '__EASYSCHOLAR_API_KEY_SYNC__';
  const WOS_QUERY_ACCESS_SYNC_EVENT = '__WOS_QUERY_ACCESS_SYNC__';
  const isCnkiTabUrl = (value) => {
    try {
      return /(^|\.)cnki\.net$/i.test(new URL(value || '').hostname);
    } catch (_error) {
      return false;
    }
  };
  const isWosTabUrl = (value) => {
    try {
      const parsed = new URL(value || '');
      return classifyWosHost(parsed.hostname, parsed.href) !== 'unsupported';
    } catch (_error) {
      return false;
    }
  };

  // ========== Status Management ==========
  const statusClasses = ['status--success', 'status--error', 'status--info', 'status--muted'];
  const OPENAI_HOST_ORIGINS = ['https://api.openai.com/*'];
  const EASYSCHOLAR_HOST_ORIGINS = ['https://www.easyscholar.cc/*'];
  const LM_STUDIO_HOST_ORIGIN_MAP = {
    'http://127.0.0.1': 'http://127.0.0.1/*',
    'http://localhost': 'http://localhost/*'
  };

  const setStatus = (element, message, variant) => {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.remove(...statusClasses);
    if (variant) {
      element.classList.add(variant);
    }
  };

  const containsOriginPermissions = (origins) => new Promise((resolve) => {
    if (!chrome.permissions?.contains || !Array.isArray(origins) || !origins.length) {
      resolve(false);
      return;
    }
    chrome.permissions.contains({ origins }, (granted) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });

  const requestOriginPermissions = (origins) => new Promise((resolve) => {
    if (!chrome.permissions?.request || !Array.isArray(origins) || !origins.length) {
      resolve(false);
      return;
    }
    chrome.permissions.request({ origins }, (granted) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });

  const stableHostHash = (value) => {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const registerPersistentWosHost = (tab) => new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(tab?.url || '');
    } catch (_error) {
      reject(new Error('The active tab URL is unavailable.'));
      return;
    }
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error('Only HTTPS WOS proxy pages can be registered.'));
      return;
    }

    const matchPattern = `${parsedUrl.origin}/*`;
    const suffix = stableHostHash(parsedUrl.hostname);
    const registrations = [
      {
        id: `wos-aide-proxy-loader-${suffix}`,
        matches: [matchPattern],
        js: ['wos-proxy-marker.js', 'z-Wos-loader.js'],
        runAt: 'document_start',
        persistAcrossSessions: true
      },
      {
        id: `wos-aide-proxy-content-${suffix}`,
        matches: [matchPattern],
        js: ['wos-proxy-marker.js', 'contentScript.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }
    ];
    const ids = registrations.map(item => item.id);

    chrome.scripting.getRegisteredContentScripts({ ids }, existing => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const register = () => {
        chrome.scripting.registerContentScripts(registrations, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve({ matchPattern, registered: true });
        });
      };
      if (!existing?.length) {
        register();
        return;
      }
      chrome.scripting.unregisterContentScripts({ ids: existing.map(item => item.id) }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        register();
      });
    });
  });

  const getLmStudioPermissionOrigins = (rawBaseUrl) => {
    try {
      const parsed = new URL((rawBaseUrl || 'http://127.0.0.1:1234/v1').trim() || 'http://127.0.0.1:1234/v1');
      const normalizedOrigin = `${parsed.protocol}//${parsed.hostname}`.toLowerCase();
      const matchPattern = LM_STUDIO_HOST_ORIGIN_MAP[normalizedOrigin];
      return matchPattern ? [matchPattern] : [];
    } catch (_error) {
      return [];
    }
  };

  const withActiveTab = (callback) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        callback(null);
        return;
      }
      callback(tab);
    });
  };

  const sendMessageToTabWithBootstrap = (tabId, message, onComplete) => {
    const send = () => {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (!chrome.runtime.lastError) {
          onComplete(null, response);
          return;
        }

        const errorMessage = chrome.runtime.lastError.message || '';
        if (!/Receiving end does not exist/i.test(errorMessage)) {
          onComplete(new Error(errorMessage));
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ['contentScript.js'],
          },
          () => {
            if (chrome.runtime.lastError) {
              onComplete(new Error(chrome.runtime.lastError.message));
              return;
            }

            chrome.tabs.sendMessage(tabId, message, retryResponse => {
              if (chrome.runtime.lastError) {
                onComplete(new Error(chrome.runtime.lastError.message));
                return;
              }
              onComplete(null, retryResponse);
            });
          }
        );
      });
    };

    send();
  };

  const executeMainWorldScripts = (tabId, files, onComplete) => {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      onComplete(new Error('chrome.scripting is unavailable'));
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files,
        world: 'MAIN',
      },
      () => {
        if (chrome.runtime.lastError) {
          onComplete(new Error(chrome.runtime.lastError.message));
          return;
        }
        onComplete(null);
      }
    );
  };

  const executeMainWorldFile = (tabId, file, onComplete) => {
    executeMainWorldScripts(tabId, [file], onComplete);
  };

  const setMainWorldLocalStorage = (tabId, key, value, onComplete) => {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      onComplete(new Error('chrome.scripting is unavailable'));
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: 'MAIN',
        func: (storageKey, storageValue) => {
          try {
            localStorage.setItem(storageKey, storageValue);
          } catch (error) {
            // Ignore storage failures in restricted contexts.
          }
        },
        args: [key, value],
      },
      () => {
        if (chrome.runtime.lastError) {
          onComplete(new Error(chrome.runtime.lastError.message));
          return;
        }
        onComplete(null);
      }
    );
  };

  document.addEventListener('DOMContentLoaded', () => {
    const isSidePanelSurface = document.body?.dataset?.surface === 'sidepanel';
    const wosQuickPanel = document.getElementById('wosQuickPanel');
    const wosQuickStatus = document.getElementById('wosQuickStatus');
    const wosSidValue = document.getElementById('wosSidValue');
    const refreshWosSidBtn = document.getElementById('refreshWosSidBtn');
    const copyWosSidBtn = document.getElementById('copyWosSidBtn');
    const cnkiQuickPanel = document.getElementById('cnkiQuickPanel');
    const cnkiQuickStatus = document.getElementById('cnkiQuickStatus');
    const refreshCnkiPdfBtn = document.getElementById('refreshCnkiPdfBtn');
    const openCnkiPdfDownloadBtn = document.getElementById('openCnkiPdfDownloadBtn');
    const openaiSettingsToggle = document.getElementById('openaiSettingsToggle');
    const openaiSettingsBody = document.getElementById('openaiSettingsBody');
    const easyScholarSettingsToggle = document.getElementById('easyScholarSettingsToggle');
    const easyScholarSettingsBody = document.getElementById('easyScholarSettingsBody');

    const apiKeyInput = document.getElementById('openaiApiKeyInput');
    const openaiApiSettingsSection = document.getElementById('openaiApiSettingsSection');
    const openaiModelSettingsSection = document.getElementById('openaiModelSettingsSection');
    const apiKeyToggleBtn = document.getElementById('openaiApiKeyToggle');
    const apiKeySaveBtn = document.getElementById('openaiApiKeySaveBtn');
    const apiKeyClearBtn = document.getElementById('openaiApiKeyClearBtn');
    const apiKeyHint = document.getElementById('openaiApiKeyHint');
    const chatModelInput = document.getElementById('openaiChatModelInput');
    const openaiModelSelectRow = document.getElementById('openaiModelSelectRow');
    const openaiModelSelect = document.getElementById('openaiModelSelect');
    const easyScholarApiKeyInput = document.getElementById('easyScholarApiKeyInput');
    const easyScholarEnabledToggle = document.getElementById('easyScholarEnabledToggle');
    const easyScholarApiKeyToggleBtn = document.getElementById('easyScholarApiKeyToggle');
    const easyScholarApiKeySaveBtn = document.getElementById('easyScholarApiKeySaveBtn');
    const easyScholarApiKeyTestBtn = document.getElementById('easyScholarApiKeyTestBtn');
    const easyScholarApiKeyClearBtn = document.getElementById('easyScholarApiKeyClearBtn');
    const easyScholarWebsiteBtn = document.getElementById('easyScholarWebsiteBtn');
    const easyScholarApiKeyHint = document.getElementById('easyScholarApiKeyHint');
    const chatModelHint = document.getElementById('openaiChatModelHint');
    const openaiLoadModelsBtn = document.getElementById('openaiLoadModelsBtn');
    const chatModelTestBtn = document.getElementById('openaiChatModelTestBtn');
    const wosQueryProviderSelect = document.getElementById('wosQueryProviderSelect');
    const wosQueryProviderEnabledToggle = document.getElementById('wosQueryProviderEnabledToggle');
    const wosQueryProviderDetails = document.getElementById('wosQueryProviderDetails');
    const wosQueryProviderHint = document.getElementById('wosQueryProviderHint');
    const lmStudioSettingsSection = document.getElementById('lmStudioSettingsSection');
    const lmStudioBaseUrlInput = document.getElementById('lmStudioBaseUrlInput');
    const lmStudioModelInput = document.getElementById('lmStudioModelInput');
    const lmStudioModelSelectRow = document.getElementById('lmStudioModelSelectRow');
    const lmStudioModelSelect = document.getElementById('lmStudioModelSelect');
    const lmStudioAutofillBtn = document.getElementById('lmStudioAutofillBtn');
    const lmStudioApiKeyInput = document.getElementById('lmStudioApiKeyInput');
    const lmStudioApiKeyToggle = document.getElementById('lmStudioApiKeyToggle');
    const lmStudioSaveBtn = document.getElementById('lmStudioSaveBtn');
    const lmStudioTestBtn = document.getElementById('lmStudioTestBtn');
    const lmStudioHint = document.getElementById('lmStudioHint');

    const sidDisplay = document.getElementById('popupStatus');

    let currentWosTab = null;
    let currentPopupSid = '';

    const setWosQuickStatus = (message, variant = 'status--muted') => {
      setStatus(wosQuickStatus, message, variant);
    };

    const setWosQuickActionsEnabled = (enabled) => {
      if (copyWosSidBtn) copyWosSidBtn.disabled = !currentPopupSid;
    };

    const getActiveTab = () => new Promise(resolve => withActiveTab(resolve));

    const readCurrentSidFromTab = (tabId) => new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: resolveWosSidInMainWorld
      }, results => {
        if (chrome.runtime.lastError) {
          resolve({ sid: '', error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ sid: String(results?.[0]?.result || '').trim(), error: '' });
      });
    });

    const refreshPopupSid = async () => {
      if (refreshWosSidBtn) {
        refreshWosSidBtn.disabled = true;
        refreshWosSidBtn.querySelector('i')?.classList.add('fa-spin');
      }
      currentPopupSid = '';
      if (wosSidValue) wosSidValue.value = '';
      setWosQuickActionsEnabled(false);
      setWosQuickStatus('', 'status--muted');

      const tab = await getActiveTab();
      currentWosTab = tab;
      const isCnkiTab = !isSidePanelSurface && isCnkiTabUrl(tab?.url);
      if (wosQuickPanel) wosQuickPanel.hidden = isCnkiTab;
      if (cnkiQuickPanel) cnkiQuickPanel.hidden = !isCnkiTab;
      if (isCnkiTab) {
        if (refreshCnkiPdfBtn) {
          refreshCnkiPdfBtn.disabled = true;
          refreshCnkiPdfBtn.querySelector('i')?.classList.add('fa-spin');
        }
        if (openCnkiPdfDownloadBtn) openCnkiPdfDownloadBtn.disabled = true;
        setStatus(cnkiQuickStatus, 'Scanning the current CNKI page...', 'status--info');
        await new Promise(resolve => {
          sendMessageToTabWithBootstrap(tab.id, { type: 'GET_CNKI_PDF_LINK_COUNT' }, (error, response) => {
            if (error || !response?.success) {
              setStatus(
                cnkiQuickStatus,
                error?.message || response?.error || 'Could not scan the current CNKI page.',
                'status--error'
              );
            } else {
              const count = Number(response.count) || 0;
              setStatus(
                cnkiQuickStatus,
                `${count} unique PDF download link${count === 1 ? '' : 's'} found on this page.`,
                count ? 'status--success' : 'status--muted'
              );
              if (openCnkiPdfDownloadBtn) openCnkiPdfDownloadBtn.disabled = false;
            }
            resolve();
          });
        });
        if (refreshCnkiPdfBtn) {
          refreshCnkiPdfBtn.disabled = false;
          refreshCnkiPdfBtn.querySelector('i')?.classList.remove('fa-spin');
        }
        if (refreshWosSidBtn) {
          refreshWosSidBtn.disabled = false;
          refreshWosSidBtn.querySelector('i')?.classList.remove('fa-spin');
        }
        return;
      }
      if (isSidePanelSurface && !isWosTabUrl(tab?.url)) {
        setWosQuickStatus('Open a Web of Science page to use these tools.', 'status--muted');
        if (refreshWosSidBtn) {
          refreshWosSidBtn.disabled = false;
          refreshWosSidBtn.querySelector('i')?.classList.remove('fa-spin');
        }
        return;
      }
      if (!tab?.id) {
        setWosQuickStatus('Open a Web of Science page to use these tools.', 'status--muted');
      } else {
        let lastError = '';
        const retryDelays = [0, 150, 400];
        for (const delay of retryDelays) {
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          const result = await readCurrentSidFromTab(tab.id);
          if (result.sid) {
            currentPopupSid = result.sid;
            if (wosSidValue) wosSidValue.value = result.sid;
            setWosQuickActionsEnabled(true);
            setWosQuickStatus('Current SID ready. DOI and UUID tools are available.', 'status--success');
            break;
          }
          lastError = result.error || lastError;
        }
        if (!currentPopupSid) {
          setWosQuickStatus('WOS session is not ready. Refresh or sign in to WOS first.', 'status--muted');
        }
      }

      if (refreshWosSidBtn) {
        refreshWosSidBtn.disabled = false;
        refreshWosSidBtn.querySelector('i')?.classList.remove('fa-spin');
      }
    };

    refreshWosSidBtn?.addEventListener('click', refreshPopupSid);
    refreshCnkiPdfBtn?.addEventListener('click', refreshPopupSid);
    openCnkiPdfDownloadBtn?.addEventListener('click', async () => {
      const tab = await getActiveTab();
      if (!tab?.id || !isCnkiTabUrl(tab.url)) {
        setStatus(cnkiQuickStatus, 'Open a CNKI results page first.', 'status--error');
        return;
      }
      openCnkiPdfDownloadBtn.disabled = true;
      setStatus(cnkiQuickStatus, 'Opening the CNKI downloader...', 'status--info');
      chrome.storage.local.set({ cnkiPdfDownloadEnabled: true }, () => {
        sendMessageToTabWithBootstrap(tab.id, { type: 'OPEN_CNKI_PDF_DOWNLOAD' }, (error, response) => {
          if (error || !response?.success) {
            openCnkiPdfDownloadBtn.disabled = false;
            setStatus(
              cnkiQuickStatus,
              error?.message || response?.error || 'Failed to open the CNKI downloader.',
              'status--error'
            );
            return;
          }
          setStatus(cnkiQuickStatus, 'CNKI downloader opened on the page.', 'status--success');
          if (!isSidePanelSurface) window.setTimeout(() => window.close(), 120);
        });
      });
    });
    copyWosSidBtn?.addEventListener('click', async () => {
      if (!currentPopupSid) {
        await refreshPopupSid();
      }
      if (!currentPopupSid) return;
      try {
        await navigator.clipboard.writeText(currentPopupSid);
        setWosQuickStatus('Current SID copied.', 'status--success');
        const icon = copyWosSidBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-check';
        window.setTimeout(() => {
          if (icon) icon.className = 'fa-regular fa-copy';
        }, 1200);
      } catch (error) {
        setWosQuickStatus('SID found, but clipboard copy failed.', 'status--error');
      }
    });
    refreshPopupSid();

    // 新增：DOI列表显示区域和清空按钮


    const clearDoiBtn = document.getElementById('clearDoiBtn');
    const doiListDisplay = document.getElementById('doiListDisplay');
    if (clearDoiBtn) {
      clearDoiBtn.title = 'Clear DOI List';
      clearDoiBtn.onclick = () => {
        chrome.storage.local.set({ wosAideDoiList: [] });
      };
    }

    // 显示DOI数量或无DOI
    function updateDoiButton(list) {
      if (!clearDoiBtn || !doiListDisplay) return;
      if (!list || list.length === 0) {
        doiListDisplay.textContent = '';
        clearDoiBtn.disabled = true;
        clearDoiBtn.classList.add('button--disabled');
        clearDoiBtn.style.display = 'none';
      } else {
        doiListDisplay.innerHTML = `<b>Received DOI list: ${list.length} DOIs</b>`;
        clearDoiBtn.disabled = false;
        clearDoiBtn.classList.remove('button--disabled');
        clearDoiBtn.style.display = 'flex';
      }
    }

    // 初始状态
    if (doiListDisplay) doiListDisplay.textContent = '';
    if (clearDoiBtn) {
      clearDoiBtn.disabled = true;
      clearDoiBtn.classList.add('button--disabled');
      clearDoiBtn.style.display = 'none';
    }

    // 读取chrome.storage.local中的DOI列表
    chrome.storage.local.get(['wosAideDoiList'], result => {
      updateDoiButton(result.wosAideDoiList || []);
    });

    // 监听chrome.storage.onChanged，实时更新DOI列表
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.wosAideDoiList) {
        updateDoiButton(changes.wosAideDoiList.newValue || []);
      }
    });

    let currentEasyScholarApiKey = '';
    let currentEasyScholarVerified = false;
    let currentEasyScholarEnabled = false;
    let currentWosQueryProvider = 'openai';
    let currentWosQueryEnabled = false;
    let currentOpenAIVerified = false;
    let currentLmStudioVerified = false;

    const updateApiKeyHint = (message, variant) => {
      if (!apiKeyHint) return;
      apiKeyHint.textContent = message;
      apiKeyHint.classList.remove(...statusClasses);
      if (variant) {
        apiKeyHint.classList.add(variant);
      }
    };

    const updateEasyScholarApiKeyHint = (message, variant) => {
      if (!easyScholarApiKeyHint) return;
      easyScholarApiKeyHint.textContent = message;
      easyScholarApiKeyHint.classList.remove(...statusClasses);
      if (variant) {
        easyScholarApiKeyHint.classList.add(variant);
      }
    };

    const syncEasyScholarHintFromState = () => {
      if (!currentEasyScholarEnabled) {
        updateEasyScholarApiKeyHint('Journal Query is disabled.', 'status--muted');
        return;
      }
      if (currentEasyScholarVerified) {
        updateEasyScholarApiKeyHint('Verified. Journal Query is available.', 'status--success');
        return;
      }
      updateEasyScholarApiKeyHint('Journal Query is visible. Test the key before sending requests.', 'status--info');
    };

    const syncEasyScholarStateToTab = (tabId, apiKey, verified, enabled, onComplete) => {
      if (!chrome.scripting || !chrome.scripting.executeScript) {
        onComplete(new Error('chrome.scripting is unavailable'));
        return;
      }
      chrome.scripting.executeScript(
          {
            target: { tabId },
            world: 'MAIN',
          func: (storageKey, storageValue, verifiedKey, verifiedValue, enabledKey, enabledValue, eventName) => {
            try {
              localStorage.setItem(storageKey, storageValue);
              localStorage.setItem(verifiedKey, String(Boolean(verifiedValue)));
              localStorage.setItem(enabledKey, String(Boolean(enabledValue)));
            } catch (error) {
              // Ignore storage failures in restricted contexts.
            }
            document.dispatchEvent(new CustomEvent(eventName, {
              detail: {
                enabled: Boolean(enabledValue),
                verified: Boolean(verifiedValue)
              }
            }));
          },
          args: [
            EASYSCHOLAR_API_KEY_STORAGE_KEY,
            apiKey,
            EASYSCHOLAR_API_KEY_VERIFIED_STORAGE_KEY,
            verified,
            EASYSCHOLAR_ENABLED_STORAGE_KEY,
            enabled,
            EASYSCHOLAR_API_KEY_SYNC_EVENT
          ],
        },
        () => {
          if (chrome.runtime.lastError) {
            onComplete(new Error(chrome.runtime.lastError.message));
            return;
          }
          onComplete(null);
        }
      );
    };

    const syncEasyScholarStateToActiveTab = (apiKey, verified, enabled = currentEasyScholarEnabled) => {
      withActiveTab((tab) => {
        if (!tab) {
          return;
        }
        syncEasyScholarStateToTab(tab.id, apiKey, verified, enabled, (error) => {
          if (error) {
            console.warn('Failed to sync EasyScholar state to page:', error.message);
          }
        });
      });
    };

    const saveApiKey = (apiKey) => {
      chrome.storage.local.set({ [CHAT_API_KEY_STORAGE_KEY]: apiKey }, () => {
        if (chrome.runtime.lastError) {
          updateApiKeyHint('Failed to save API key.', 'status--error');
          return;
        }
        setProviderVerifiedState('openai', false);
        updateApiKeyHint('API key saved for all pages.', 'status--success');
      });
    };

    const setEasyScholarStoredState = (apiKey, verified, hintMessage, hintVariant, statusMessage, statusVariant) => {
      chrome.storage.local.set({
        [EASYSCHOLAR_API_KEY_STORAGE_KEY]: apiKey,
        [EASYSCHOLAR_API_KEY_VERIFIED_STORAGE_KEY]: Boolean(verified)
      }, () => {
        if (chrome.runtime.lastError) {
          updateEasyScholarApiKeyHint('Failed to save EasyScholar state.', 'status--error');
          return;
        }
        currentEasyScholarApiKey = apiKey;
        currentEasyScholarVerified = Boolean(verified);
        updateEasyScholarApiKeyHint(hintMessage, hintVariant);
        syncEasyScholarStateToActiveTab(apiKey, verified);
      });
    };

    const saveEasyScholarEnabled = (enabled) => {
      currentEasyScholarEnabled = Boolean(enabled);
      chrome.storage.local.set({ [EASYSCHOLAR_ENABLED_STORAGE_KEY]: currentEasyScholarEnabled }, () => {
        if (chrome.runtime.lastError) {
          updateEasyScholarApiKeyHint('Failed to save Journal Query enabled state.', 'status--error');
          setStatus(sidDisplay, 'Failed to save Journal Query state', 'status--error');
          return;
        }
        if (easyScholarEnabledToggle) {
          easyScholarEnabledToggle.checked = currentEasyScholarEnabled;
        }
        syncEasyScholarHintFromState();
        syncEasyScholarStateToActiveTab(currentEasyScholarApiKey, currentEasyScholarVerified, currentEasyScholarEnabled);
        setStatus(
          sidDisplay,
          currentEasyScholarEnabled ? 'Journal Query enabled' : 'Journal Query disabled',
          currentEasyScholarEnabled ? 'status--success' : 'status--muted'
        );
      });
    };

    const saveEasyScholarApiKey = (apiKey) => {
      const key = (apiKey || '').trim();
      if (key === currentEasyScholarApiKey && currentEasyScholarVerified) {
        syncEasyScholarHintFromState();
        syncEasyScholarStateToActiveTab(key, true);
        return;
      }
      setEasyScholarStoredState(
        key,
        false,
        key ? 'Key saved. Test it before sending Journal Query requests.' : 'EasyScholar key cleared.',
        key ? 'status--info' : 'status--muted',
        key ? 'EasyScholar key saved, verification required' : 'EasyScholar key cleared',
        key ? 'status--info' : 'status--muted'
      );
    };

    const testEasyScholarApiKey = async (apiKey) => {
      const key = (apiKey || '').trim();
      if (!key) {
        updateEasyScholarApiKeyHint('Enter an EasyScholar API key first.', 'status--error');
        setStatus(sidDisplay, 'EasyScholar key missing', 'status--error');
        return false;
      }
      if (!await ensureEasyScholarHostPermission()) {
        return false;
      }

      updateEasyScholarApiKeyHint('Testing EasyScholar API key...', 'status--info');
      setStatus(sidDisplay, 'Testing EasyScholar key...', 'status--info');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const url = `https://www.easyscholar.cc/open/getPublicationRank?secretKey=${encodeURIComponent(key)}&publicationName=${encodeURIComponent('Nature')}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data?.code === 200) {
          setEasyScholarStoredState(
            key,
            true,
            'Verification passed. Journal Query is now available.',
            'status--success',
            'EasyScholar key verified',
            'status--success'
          );
          return true;
        }

        setEasyScholarStoredState(
          key,
          false,
          data?.message || 'Verification failed.',
          'status--error',
          'EasyScholar verification failed',
          'status--error'
        );
        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        setEasyScholarStoredState(
          key,
          false,
          error?.name === 'AbortError' ? 'EasyScholar test timed out.' : 'Verification failed. Check the key and try again.',
          'status--error',
          'EasyScholar verification failed',
          'status--error'
        );
        return false;
      }
    };

    if (apiKeyInput) {
      chrome.storage.local.get([CHAT_API_KEY_STORAGE_KEY], result => {
        apiKeyInput.value = result[CHAT_API_KEY_STORAGE_KEY] || '';
        updateApiKeyHint('Loaded from extension storage.', 'status--muted');
      });

      apiKeyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveApiKey(apiKeyInput.value.trim());
        }
      });

      apiKeyInput.addEventListener('blur', () => {
        saveApiKey(apiKeyInput.value.trim());
      });
    }

    if (easyScholarApiKeyInput) {
      chrome.storage.local.get([EASYSCHOLAR_API_KEY_STORAGE_KEY], result => {
        currentEasyScholarApiKey = result[EASYSCHOLAR_API_KEY_STORAGE_KEY] || '';
        easyScholarApiKeyInput.value = currentEasyScholarApiKey;
      });
      chrome.storage.local.get([EASYSCHOLAR_API_KEY_VERIFIED_STORAGE_KEY], result => {
        const verified = Boolean(result[EASYSCHOLAR_API_KEY_VERIFIED_STORAGE_KEY]);
        currentEasyScholarVerified = verified;
        syncEasyScholarHintFromState();
      });
      chrome.storage.local.get([EASYSCHOLAR_ENABLED_STORAGE_KEY], result => {
        currentEasyScholarEnabled = isSidePanelSurface || Boolean(result[EASYSCHOLAR_ENABLED_STORAGE_KEY]);
        if (isSidePanelSurface) {
          chrome.storage.local.set({ [EASYSCHOLAR_ENABLED_STORAGE_KEY]: true });
        }
        if (easyScholarEnabledToggle) {
          easyScholarEnabledToggle.checked = currentEasyScholarEnabled;
        }
        syncEasyScholarHintFromState();
      });

      easyScholarApiKeyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveEasyScholarApiKey(easyScholarApiKeyInput.value.trim());
        }
      });

      easyScholarApiKeyInput.addEventListener('blur', () => {
        saveEasyScholarApiKey(easyScholarApiKeyInput.value.trim());
      });
    }

    if (easyScholarEnabledToggle) {
      easyScholarEnabledToggle.addEventListener('change', async () => {
        if (easyScholarEnabledToggle.checked && !await ensureEasyScholarHostPermission()) {
          easyScholarEnabledToggle.checked = false;
          return;
        }
        saveEasyScholarEnabled(easyScholarEnabledToggle.checked);
      });
    }

    const updateChatModelHint = (message, variant) => {
      if (!chatModelHint) return;
      chatModelHint.textContent = message;
      chatModelHint.classList.remove(...statusClasses);
      if (variant) {
        chatModelHint.classList.add(variant);
      }
    };

    const updateWosQueryProviderHint = (message, variant) => {
      if (!wosQueryProviderHint) return;
      wosQueryProviderHint.textContent = message;
      wosQueryProviderHint.classList.remove(...statusClasses);
      if (variant) {
        wosQueryProviderHint.classList.add(variant);
      }
    };

    const updateLmStudioHint = (message, variant) => {
      if (!lmStudioHint) return;
      lmStudioHint.textContent = message;
      lmStudioHint.classList.remove(...statusClasses);
      if (variant) {
        lmStudioHint.classList.add(variant);
      }
    };

    const ensureOpenAIHostPermission = async () => {
      if (await containsOriginPermissions(OPENAI_HOST_ORIGINS)) {
        return true;
      }
      const granted = await requestOriginPermissions(OPENAI_HOST_ORIGINS);
      if (!granted) {
        updateChatModelHint('OpenAI host access was not granted.', 'status--error');
        setStatus(sidDisplay, 'OpenAI host access denied', 'status--error');
      }
      return granted;
    };

    const ensureEasyScholarHostPermission = async () => {
      if (await containsOriginPermissions(EASYSCHOLAR_HOST_ORIGINS)) {
        return true;
      }
      const granted = await requestOriginPermissions(EASYSCHOLAR_HOST_ORIGINS);
      if (!granted) {
        updateEasyScholarApiKeyHint('EasyScholar host access was not granted.', 'status--error');
        setStatus(sidDisplay, 'EasyScholar host access denied', 'status--error');
      }
      return granted;
    };

    const ensureLmStudioHostPermission = async () => {
      const origins = getLmStudioPermissionOrigins(lmStudioBaseUrlInput?.value || '');
      if (!origins.length) {
        updateLmStudioHint('LM Studio host must use localhost or 127.0.0.1 over http.', 'status--error');
        setStatus(sidDisplay, 'Unsupported LM Studio host', 'status--error');
        return false;
      }
      if (await containsOriginPermissions(origins)) {
        return true;
      }
      const granted = await requestOriginPermissions(origins);
      if (!granted) {
        updateLmStudioHint('LM Studio host access was not granted.', 'status--error');
        setStatus(sidDisplay, 'LM Studio host access denied', 'status--error');
      }
      return granted;
    };

    const getCurrentProviderVerified = () => (
      currentWosQueryProvider === 'lmstudio' ? currentLmStudioVerified : currentOpenAIVerified
    );

    const syncWosQueryAccessToTab = (tabId, detail, onComplete) => {
      if (!chrome.scripting || !chrome.scripting.executeScript) {
        onComplete(new Error('chrome.scripting is unavailable'));
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: 'MAIN',
          func: (syncDetail, eventName) => {
            document.dispatchEvent(new CustomEvent(eventName, {
              detail: syncDetail
            }));
          },
          args: [detail, WOS_QUERY_ACCESS_SYNC_EVENT],
        },
        () => {
          if (chrome.runtime.lastError) {
            onComplete(new Error(chrome.runtime.lastError.message));
            return;
          }
          onComplete(null);
        }
      );
    };

    const syncWosQueryAccessToActiveTab = () => {
      const detail = {
        provider: currentWosQueryProvider,
        enabled: currentWosQueryEnabled,
        verified: getCurrentProviderVerified()
      };
      withActiveTab((tab) => {
        if (!tab) return;
        syncWosQueryAccessToTab(tab.id, detail, (error) => {
          if (error) {
            console.warn('Failed to sync WOS query access to page:', error.message);
          }
        });
      });
    };

    const updateWosQueryAccessHint = () => {
      const providerLabel = currentWosQueryProvider === 'lmstudio' ? 'LM Studio' : 'OpenAI';
      if (!currentWosQueryEnabled) {
        updateWosQueryProviderHint('WOS Query is disabled. Turn it on to allow the tab to appear.', 'status--muted');
        return;
      }
      if (!getCurrentProviderVerified()) {
        updateWosQueryProviderHint(`WOS Query is visible. Test ${providerLabel} before sending requests.`, 'status--info');
        return;
      }
      updateWosQueryProviderHint(`WOS Query is enabled and verified with ${providerLabel}.`, 'status--success');
    };

    const setProviderVerifiedState = (provider, verified) => {
      const storageKey = provider === 'lmstudio'
        ? WOS_QUERY_LMSTUDIO_VERIFIED_STORAGE_KEY
        : WOS_QUERY_OPENAI_VERIFIED_STORAGE_KEY;
      if (provider === 'lmstudio') {
        currentLmStudioVerified = Boolean(verified);
      } else {
        currentOpenAIVerified = Boolean(verified);
      }
      chrome.storage.local.set({ [storageKey]: Boolean(verified) }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to persist provider verified state:', chrome.runtime.lastError.message);
          return;
        }
        updateWosQueryAccessHint();
        syncWosQueryAccessToActiveTab();
      });
    };

    const updateProviderVisibility = () => {
      if (!wosQueryProviderSelect || !lmStudioSettingsSection || !openaiApiSettingsSection || !openaiModelSettingsSection) return;
      const isEnabled = Boolean(currentWosQueryEnabled);
      const isLmStudio = wosQueryProviderSelect.value === 'lmstudio';
      if (wosQueryProviderDetails) {
        wosQueryProviderDetails.style.display = isEnabled ? 'block' : 'none';
      }
      openaiApiSettingsSection.style.display = isLmStudio ? 'none' : 'flex';
      openaiModelSettingsSection.style.display = isLmStudio ? 'none' : 'flex';
      lmStudioSettingsSection.style.display = isLmStudio ? 'flex' : 'none';
      if (!isEnabled) {
        openaiApiSettingsSection.style.display = 'none';
        openaiModelSettingsSection.style.display = 'none';
        lmStudioSettingsSection.style.display = 'none';
      }
      currentWosQueryProvider = wosQueryProviderSelect.value || 'openai';
      updateWosQueryAccessHint();
    };

    const saveWosQueryProvider = (provider) => {
      currentWosQueryProvider = provider || 'openai';
      chrome.storage.local.set({ [WOS_QUERY_PROVIDER_STORAGE_KEY]: currentWosQueryProvider }, () => {
        if (chrome.runtime.lastError) {
          updateWosQueryProviderHint('Failed to save provider.', 'status--error');
          setStatus(sidDisplay, 'Failed to save WOS provider', 'status--error');
          return;
        }
        updateProviderVisibility();
        syncWosQueryAccessToActiveTab();
        setStatus(sidDisplay, `WOS Query provider: ${currentWosQueryProvider === 'lmstudio' ? 'LM Studio' : 'OpenAI'}`, 'status--success');
      });
    };

    const saveWosQueryEnabled = (enabled) => {
      currentWosQueryEnabled = Boolean(enabled);
      chrome.storage.local.set({ [WOS_QUERY_ENABLED_STORAGE_KEY]: currentWosQueryEnabled }, () => {
        if (chrome.runtime.lastError) {
          updateWosQueryProviderHint('Failed to save WOS Query enabled state.', 'status--error');
          setStatus(sidDisplay, 'Failed to save WOS Query state', 'status--error');
          return;
        }
        if (wosQueryProviderEnabledToggle) {
          wosQueryProviderEnabledToggle.checked = currentWosQueryEnabled;
        }
        updateProviderVisibility();
        updateWosQueryAccessHint();
        syncWosQueryAccessToActiveTab();
        setStatus(sidDisplay, currentWosQueryEnabled ? 'WOS Query enabled' : 'WOS Query disabled', currentWosQueryEnabled ? 'status--success' : 'status--muted');
      });
    };

    const saveLmStudioSettings = () => {
      const baseUrl = (lmStudioBaseUrlInput?.value || '').trim() || 'http://127.0.0.1:1234/v1';
      const model = (lmStudioModelInput?.value || '').trim();
      const apiKey = (lmStudioApiKeyInput?.value || '').trim();

      chrome.storage.local.set({
        [LM_STUDIO_BASE_URL_STORAGE_KEY]: baseUrl,
        [LM_STUDIO_MODEL_STORAGE_KEY]: model,
        [LM_STUDIO_API_KEY_STORAGE_KEY]: apiKey
      }, () => {
        if (chrome.runtime.lastError) {
          updateLmStudioHint('Failed to save LM Studio settings.', 'status--error');
          setStatus(sidDisplay, 'Failed to save LM Studio settings', 'status--error');
          return;
        }
        if (lmStudioBaseUrlInput) lmStudioBaseUrlInput.value = baseUrl;
        setProviderVerifiedState('lmstudio', false);
        updateLmStudioHint('LM Studio settings saved. Test again to enable WOS Query.', 'status--info');
        setStatus(sidDisplay, 'LM Studio settings saved, verification reset', 'status--info');
      });
    };

    const getLmStudioModelsEndpoint = (rawBaseUrl) => {
      const normalized = (rawBaseUrl || 'http://127.0.0.1:1234/v1').trim();
      const url = normalized.replace(/\/$/, '');
      if (/\/v1$/i.test(url)) {
        return `${url}/models`;
      }
      return `${url}/v1/models`;
    };

    const extractLmStudioModelId = (payload) => {
      if (!payload) return '';
      if (typeof payload === 'string') {
        return payload.trim();
      }

      const directCandidates = [
        payload.model,
        payload.model_name,
        payload.modelName,
        payload.name,
        payload.id
      ];
      for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }

      const nestedObjects = [
        payload.data,
        payload.result,
        payload.loaded,
        payload.current,
        payload.current_model,
        payload.currentModel
      ];
      for (const value of nestedObjects) {
        if (!value) continue;
        const nested = extractLmStudioModelId(value);
        if (nested) {
          return nested;
        }
      }

      if (Array.isArray(payload)) {
        for (const item of payload) {
          const nested = extractLmStudioModelId(item);
          if (nested) {
            return nested;
          }
        }
      }

      return '';
    };

    const populateLmStudioModelSelect = (models) => {
      if (!lmStudioModelSelect || !lmStudioModelSelectRow) {
        return;
      }

      lmStudioModelSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = models.length ? 'Select a loaded model' : 'No models found';
      lmStudioModelSelect.appendChild(placeholder);

      const currentValue = (lmStudioModelInput?.value || '').trim();
      models.forEach((modelId) => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        if (currentValue && currentValue === modelId) {
          option.selected = true;
        }
        lmStudioModelSelect.appendChild(option);
      });

      lmStudioModelSelectRow.style.display = models.length ? 'flex' : 'none';
    };

    const fetchLmStudioModels = async () => {
      const baseUrl = ((lmStudioBaseUrlInput?.value || '').trim() || 'http://127.0.0.1:1234/v1');
      const apiKey = (lmStudioApiKeyInput?.value || '').trim();
      const endpoint = getLmStudioModelsEndpoint(baseUrl);
      if (!await ensureLmStudioHostPermission()) {
        return [];
      }

      updateLmStudioHint('Fetching LM Studio model list...', 'status--info');
      setStatus(sidDisplay, 'Fetching LM Studio model list...', 'status--info');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const headers = {};
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          updateLmStudioHint('Failed to load LM Studio model list.', 'status--error');
          setStatus(sidDisplay, `LM Studio model list failed: ${response.status}`, 'status--error');
          console.error('LM Studio model list failed:', errorText);
          return [];
        }

        const payload = await response.json();
        const rawModels = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.models)
              ? payload.models
              : [];

        const models = rawModels
          .map((item) => extractLmStudioModelId(item))
          .filter(Boolean);

        if (!models.length) {
          populateLmStudioModelSelect([]);
          updateLmStudioHint('LM Studio responded, but no models were found.', 'status--error');
          setStatus(sidDisplay, 'No LM Studio models found', 'status--error');
          return [];
        }

        populateLmStudioModelSelect(models);
        updateLmStudioHint(`Loaded ${models.length} LM Studio model${models.length > 1 ? 's' : ''}.`, 'status--success');
        setStatus(sidDisplay, `LM Studio models loaded: ${models.length}`, 'status--success');
        return models;
      } catch (error) {
        clearTimeout(timeoutId);
        const message = error.name === 'AbortError'
          ? 'LM Studio model list timed out.'
          : 'Failed to fetch the LM Studio model list.';
        updateLmStudioHint(message, 'status--error');
        setStatus(sidDisplay, message, 'status--error');
        return [];
      }
    };

    const testLmStudioSettings = async () => {
      const baseUrl = ((lmStudioBaseUrlInput?.value || '').trim() || 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
      const model = (lmStudioModelInput?.value || '').trim();
      const apiKey = (lmStudioApiKeyInput?.value || '').trim();

      if (!model) {
        updateLmStudioHint('Enter an LM Studio model id first.', 'status--error');
        setStatus(sidDisplay, 'LM Studio model missing', 'status--error');
        return false;
      }
      if (!await ensureLmStudioHostPermission()) {
        return false;
      }

      updateLmStudioHint('Testing LM Studio...', 'status--info');
      setStatus(sidDisplay, 'Testing LM Studio...', 'status--info');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Say OK.' }],
            temperature: 0,
            max_tokens: 16
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          setProviderVerifiedState('lmstudio', false);
          updateLmStudioHint('LM Studio test failed. Check URL or model.', 'status--error');
          setStatus(sidDisplay, `LM Studio test failed: ${response.status}`, 'status--error');
          console.error('LM Studio test failed:', errorText);
          return false;
        }

        setProviderVerifiedState('lmstudio', true);
        updateLmStudioHint('LM Studio connection succeeded.', 'status--success');
        setStatus(sidDisplay, 'LM Studio test succeeded', 'status--success');
        return true;
      } catch (error) {
        clearTimeout(timeoutId);
        const message = error.name === 'AbortError' ? 'LM Studio test timed out.' : 'LM Studio test failed.';
        setProviderVerifiedState('lmstudio', false);
        updateLmStudioHint(message, 'status--error');
        setStatus(sidDisplay, message, 'status--error');
        return false;
      }
    };

    const saveChatModel = (model) => {
      const trimmedModel = (model || '').trim();
      chrome.storage.local.set({ [CHAT_MODEL_STORAGE_KEY]: trimmedModel }, () => {
        if (chrome.runtime.lastError) {
          updateChatModelHint('Failed to save model.', 'status--error');
          setStatus(sidDisplay, 'Failed to save model', 'status--error');
          return;
        }
        if (chatModelInput) {
          chatModelInput.value = trimmedModel;
        }
        setProviderVerifiedState('openai', false);
        updateChatModelHint('Model saved. Test again to enable WOS Query.', 'status--info');
        setStatus(sidDisplay, 'Chat model saved, verification reset', 'status--info');
      });
    };

    const getSelectedModel = () => {
      return (chatModelInput?.value || '').trim() || 'gpt-4o-mini';
    };

    const populateOpenAIModelSelect = (models) => {
      if (!openaiModelSelect || !openaiModelSelectRow) {
        return;
      }

      openaiModelSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = models.length ? 'Select a GPT model' : 'No GPT models found';
      openaiModelSelect.appendChild(placeholder);

      const currentValue = getSelectedModel();
      models.forEach((modelId) => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        if (currentValue && currentValue === modelId) {
          option.selected = true;
        }
        openaiModelSelect.appendChild(option);
      });

      openaiModelSelectRow.style.display = models.length ? 'flex' : 'none';
    };

    const fetchOpenAIModels = async () => {
      const apiKey = (apiKeyInput?.value || '').trim();
      if (!apiKey) {
        updateChatModelHint('Enter and save an OpenAI API key first.', 'status--error');
        setStatus(sidDisplay, 'OpenAI API key missing', 'status--error');
        return [];
      }
      if (!await ensureOpenAIHostPermission()) {
        return [];
      }

      updateChatModelHint('Fetching OpenAI GPT model list...', 'status--info');
      setStatus(sidDisplay, 'Fetching OpenAI models...', 'status--info');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          updateChatModelHint('Failed to load OpenAI models.', 'status--error');
          setStatus(sidDisplay, `OpenAI models failed: ${response.status}`, 'status--error');
          console.error('OpenAI models failed:', errorText);
          return [];
        }

        const payload = await response.json();
        const models = (Array.isArray(payload?.data) ? payload.data : [])
          .map((item) => typeof item?.id === 'string' ? item.id.trim() : '')
          .filter((id) => id && /^gpt/i.test(id))
          .sort((a, b) => a.localeCompare(b));

        populateOpenAIModelSelect(models);
        if (!models.length) {
          updateChatModelHint('No GPT models were returned by OpenAI.', 'status--error');
          setStatus(sidDisplay, 'No GPT models found', 'status--error');
          return [];
        }

        updateChatModelHint(`Loaded ${models.length} GPT model${models.length > 1 ? 's' : ''}.`, 'status--success');
        setStatus(sidDisplay, `OpenAI GPT models loaded: ${models.length}`, 'status--success');
        return models;
      } catch (error) {
        clearTimeout(timeoutId);
        const message = error.name === 'AbortError'
          ? 'OpenAI model list timed out.'
          : 'Failed to fetch OpenAI models.';
        updateChatModelHint(message, 'status--error');
        setStatus(sidDisplay, message, 'status--error');
        return [];
      }
    };

    if (chatModelInput) {
      chrome.storage.local.get([CHAT_MODEL_STORAGE_KEY], result => {
        chatModelInput.value = result[CHAT_MODEL_STORAGE_KEY] || 'gpt-4o-mini';
        updateChatModelHint('Loaded from extension storage.', 'status--muted');
      });

      chatModelInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const model = getSelectedModel();
          if (!model) {
            updateChatModelHint('Enter an OpenAI model id.', 'status--error');
            return;
          }
          saveChatModel(model);
        }
      });

      chatModelInput.addEventListener('blur', () => {
        const model = getSelectedModel();
        if (!model) {
          return;
        }
        saveChatModel(model);
      });
    }

    if (openaiModelSelect) {
      openaiModelSelect.addEventListener('change', () => {
        const model = (openaiModelSelect.value || '').trim();
        if (!model) {
          return;
        }
        if (chatModelInput) {
          chatModelInput.value = model;
        }
        saveChatModel(model);
        updateChatModelHint(`Selected OpenAI model: ${model}`, 'status--success');
        setStatus(sidDisplay, `OpenAI model selected: ${model}`, 'status--success');
      });
    }

    if (wosQueryProviderSelect) {
      chrome.storage.local.get([
        WOS_QUERY_PROVIDER_STORAGE_KEY,
        WOS_QUERY_ENABLED_STORAGE_KEY,
        WOS_QUERY_OPENAI_VERIFIED_STORAGE_KEY,
        WOS_QUERY_LMSTUDIO_VERIFIED_STORAGE_KEY
      ], result => {
        currentWosQueryProvider = result[WOS_QUERY_PROVIDER_STORAGE_KEY] || 'openai';
        currentWosQueryEnabled = isSidePanelSurface || Boolean(result[WOS_QUERY_ENABLED_STORAGE_KEY]);
        if (isSidePanelSurface) {
          chrome.storage.local.set({ [WOS_QUERY_ENABLED_STORAGE_KEY]: true });
        }
        currentOpenAIVerified = Boolean(result[WOS_QUERY_OPENAI_VERIFIED_STORAGE_KEY]);
        currentLmStudioVerified = Boolean(result[WOS_QUERY_LMSTUDIO_VERIFIED_STORAGE_KEY]);
        wosQueryProviderSelect.value = currentWosQueryProvider;
        if (wosQueryProviderEnabledToggle) {
          wosQueryProviderEnabledToggle.checked = currentWosQueryEnabled;
        }
        updateProviderVisibility();
      });
      wosQueryProviderSelect.addEventListener('change', () => {
        const nextProvider = wosQueryProviderSelect.value;
        (async () => {
          if (currentWosQueryEnabled) {
            const granted = nextProvider === 'lmstudio'
              ? await ensureLmStudioHostPermission()
              : await ensureOpenAIHostPermission();
            if (!granted) {
              wosQueryProviderSelect.value = currentWosQueryProvider;
              return;
            }
          }
          saveWosQueryProvider(nextProvider);
        })();
      });
    }

    if (wosQueryProviderEnabledToggle) {
      wosQueryProviderEnabledToggle.addEventListener('change', () => {
        (async () => {
          if (wosQueryProviderEnabledToggle.checked) {
            const granted = currentWosQueryProvider === 'lmstudio'
              ? await ensureLmStudioHostPermission()
              : await ensureOpenAIHostPermission();
            if (!granted) {
              wosQueryProviderEnabledToggle.checked = false;
              return;
            }
          }
          saveWosQueryEnabled(wosQueryProviderEnabledToggle.checked);
        })();
      });
    }

    if (lmStudioBaseUrlInput) {
      chrome.storage.local.get([LM_STUDIO_BASE_URL_STORAGE_KEY, LM_STUDIO_MODEL_STORAGE_KEY, LM_STUDIO_API_KEY_STORAGE_KEY], result => {
        lmStudioBaseUrlInput.value = result[LM_STUDIO_BASE_URL_STORAGE_KEY] || 'http://127.0.0.1:1234/v1';
        if (lmStudioModelInput) {
          lmStudioModelInput.value = result[LM_STUDIO_MODEL_STORAGE_KEY] || '';
        }
        if (lmStudioApiKeyInput) {
          lmStudioApiKeyInput.value = result[LM_STUDIO_API_KEY_STORAGE_KEY] || '';
        }
        updateLmStudioHint('Used only when provider is set to LM Studio.', 'status--muted');
      });

      lmStudioBaseUrlInput.addEventListener('blur', saveLmStudioSettings);
      lmStudioBaseUrlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveLmStudioSettings();
        }
      });
    }

    if (lmStudioModelInput) {
      lmStudioModelInput.addEventListener('blur', saveLmStudioSettings);
      lmStudioModelInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveLmStudioSettings();
        }
      });
    }

    if (lmStudioModelSelect) {
      lmStudioModelSelect.addEventListener('change', () => {
        const model = (lmStudioModelSelect.value || '').trim();
        if (!model) {
          return;
        }
        if (lmStudioModelInput) {
          lmStudioModelInput.value = model;
        }
        saveLmStudioSettings();
        updateLmStudioHint(`Selected LM Studio model: ${model}`, 'status--success');
        setStatus(sidDisplay, `LM Studio model selected: ${model}`, 'status--success');
      });
    }

    if (lmStudioApiKeyInput) {
      lmStudioApiKeyInput.addEventListener('blur', saveLmStudioSettings);
      lmStudioApiKeyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveLmStudioSettings();
        }
      });
    }

    if (chatModelTestBtn) {
      chatModelTestBtn.addEventListener('click', () => {
        chrome.storage.local.get([CHAT_API_KEY_STORAGE_KEY, CHAT_MODEL_STORAGE_KEY], async result => {
          const apiKey = result[CHAT_API_KEY_STORAGE_KEY] || '';
          const model = result[CHAT_MODEL_STORAGE_KEY] || getSelectedModel();
          if (!apiKey) {
            updateChatModelHint('API key missing.', 'status--error');
            setStatus(sidDisplay, 'API key missing', 'status--error');
            return;
          }
          if (!model) {
            updateChatModelHint('Model missing.', 'status--error');
            setStatus(sidDisplay, 'Model missing', 'status--error');
            return;
          }
          if (!await ensureOpenAIHostPermission()) {
            return;
          }

          updateChatModelHint('Testing model...', 'status--info');
          setStatus(sidDisplay, 'Testing model...', 'status--info');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model,
                input: 'Say OK.'
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              setProviderVerifiedState('openai', false);
              updateChatModelHint('Test failed. Check model or key.', 'status--error');
              setStatus(sidDisplay, `Test failed: ${response.status}`, 'status--error');
              console.error('Model test failed:', errorText);
              return;
            }

            setProviderVerifiedState('openai', true);
            updateChatModelHint('Test succeeded.', 'status--success');
            setStatus(sidDisplay, 'Model test succeeded', 'status--success');
          } catch (error) {
            clearTimeout(timeoutId);
            const message = error.name === 'AbortError' ? 'Test timed out.' : 'Test failed.';
            setProviderVerifiedState('openai', false);
            updateChatModelHint(message, 'status--error');
            setStatus(sidDisplay, message, 'status--error');
          }
        });
      });
    }

    if (openaiLoadModelsBtn) {
      openaiLoadModelsBtn.addEventListener('click', async () => {
        await fetchOpenAIModels();
      });
    }

    if (apiKeySaveBtn) {
      apiKeySaveBtn.addEventListener('click', () => {
        saveApiKey((apiKeyInput?.value || '').trim());
      });
    }

    if (apiKeyClearBtn) {
      apiKeyClearBtn.addEventListener('click', () => {
        if (apiKeyInput) {
          apiKeyInput.value = '';
        }
        saveApiKey('');
      });
    }

    if (apiKeyToggleBtn && apiKeyInput) {
      apiKeyToggleBtn.addEventListener('click', () => {
        const isHidden = apiKeyInput.type === 'password';
        apiKeyInput.type = isHidden ? 'text' : 'password';
        const icon = apiKeyToggleBtn.querySelector('i');
        if (icon) {
          icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    if (easyScholarApiKeySaveBtn) {
      easyScholarApiKeySaveBtn.addEventListener('click', () => {
        saveEasyScholarApiKey((easyScholarApiKeyInput?.value || '').trim());
      });
    }

    if (easyScholarApiKeyTestBtn) {
      easyScholarApiKeyTestBtn.addEventListener('click', async () => {
        await testEasyScholarApiKey((easyScholarApiKeyInput?.value || '').trim());
      });
    }

    if (easyScholarApiKeyClearBtn) {
      easyScholarApiKeyClearBtn.addEventListener('click', () => {
        if (easyScholarApiKeyInput) {
          easyScholarApiKeyInput.value = '';
        }
        saveEasyScholarApiKey('');
      });
    }

    if (easyScholarApiKeyToggleBtn && easyScholarApiKeyInput) {
      easyScholarApiKeyToggleBtn.addEventListener('click', () => {
        const isHidden = easyScholarApiKeyInput.type === 'password';
        easyScholarApiKeyInput.type = isHidden ? 'text' : 'password';
        const icon = easyScholarApiKeyToggleBtn.querySelector('i');
        if (icon) {
          icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    if (easyScholarWebsiteBtn) {
      easyScholarWebsiteBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.easyscholar.cc/' });
      });
    }

    if (lmStudioApiKeyToggle && lmStudioApiKeyInput) {
      lmStudioApiKeyToggle.addEventListener('click', () => {
        const isHidden = lmStudioApiKeyInput.type === 'password';
        lmStudioApiKeyInput.type = isHidden ? 'text' : 'password';
        const icon = lmStudioApiKeyToggle.querySelector('i');
        if (icon) {
          icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    if (lmStudioSaveBtn) {
      lmStudioSaveBtn.addEventListener('click', () => {
        saveLmStudioSettings();
      });
    }

    if (lmStudioAutofillBtn) {
      lmStudioAutofillBtn.addEventListener('click', async () => {
        await fetchLmStudioModels();
      });
    }

    if (lmStudioTestBtn) {
      lmStudioTestBtn.addEventListener('click', async () => {
        await testLmStudioSettings();
      });
    }

    const setPanelCollapsed = (bodyElement, toggleElement, storageKey, collapsed) => {
      if (!bodyElement || !toggleElement) return;
      bodyElement.classList.toggle('is-collapsed', collapsed);
      toggleElement.classList.toggle('is-collapsed', collapsed);
      toggleElement.setAttribute('aria-expanded', String(!collapsed));
      localStorage.setItem(storageKey, String(collapsed));
    };

    if (openaiSettingsToggle) {
      const isCollapsed = !isSidePanelSurface && localStorage.getItem(OPENAI_SETTINGS_COLLAPSED_KEY) === 'true';
      setPanelCollapsed(openaiSettingsBody, openaiSettingsToggle, OPENAI_SETTINGS_COLLAPSED_KEY, isCollapsed);
      if (!isSidePanelSurface) {
        openaiSettingsToggle.addEventListener('click', () => {
          const nowCollapsed = !openaiSettingsBody || !openaiSettingsBody.classList.contains('is-collapsed');
          setPanelCollapsed(openaiSettingsBody, openaiSettingsToggle, OPENAI_SETTINGS_COLLAPSED_KEY, nowCollapsed);
        });
      }
    }

    if (easyScholarSettingsToggle) {
      const isCollapsed = !isSidePanelSurface && localStorage.getItem(EASYSCHOLAR_SETTINGS_COLLAPSED_KEY) === 'true';
      setPanelCollapsed(easyScholarSettingsBody, easyScholarSettingsToggle, EASYSCHOLAR_SETTINGS_COLLAPSED_KEY, isCollapsed);
      if (!isSidePanelSurface) {
        easyScholarSettingsToggle.addEventListener('click', () => {
          const nowCollapsed = !easyScholarSettingsBody || !easyScholarSettingsBody.classList.contains('is-collapsed');
          setPanelCollapsed(
            easyScholarSettingsBody,
            easyScholarSettingsToggle,
            EASYSCHOLAR_SETTINGS_COLLAPSED_KEY,
            nowCollapsed
          );
        });
      }
    }

  });

  // Communicate with background file by sending a message
  chrome.runtime.sendMessage(
    {
      type: 'GREETINGS',
      payload: {
        message: 'Hello from the WOS Aide side panel.',
      },
    },
    response => {
      console.log(response.message);
    }
  );
})();
