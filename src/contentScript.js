const WOS_HOST_PATTERN = /(^|\.)(webofscience\.com|webofknowledge\.com|isiknowledge\.com)$/i;
const isWosPage = () => WOS_HOST_PATTERN.test(window.location.hostname || '');
const isChatGptPage = () => /(^|\.)chatgpt\.com$/i.test(window.location.hostname || '');
const isSameWindowMessage = (event) => event?.source === window;
const allowStorageBridge = () => isWosPage() || isChatGptPage();

// 监听面板请求DOI列表
window.addEventListener('message', (event) => {
  if (!isSameWindowMessage(event) || !isWosPage()) {
    return;
  }
  if (event?.data?.type === 'WOS_AIDE_DOI_LIST_REQUEST') {
    chrome.storage.local.get(['wosAideDoiList'], result => {
      // 用 window.top.postMessage 保证面板能收到
      window.top.postMessage({
        type: 'WOS_AIDE_DOI_LIST_RESPONSE',
        doiList: result.wosAideDoiList || []
      }, '*');
    });
  }
});

// Quickload prompt storage bridge (for pages where localStorage is blocked)
window.addEventListener('message', (event) => {
  if (!isSameWindowMessage(event) || !allowStorageBridge()) {
    return;
  }
  if (event?.data?.type !== 'WOS_AIDE_QUICKLOAD_STORAGE') {
    return;
  }
  const { action, key, value, requestId } = event.data || {};
  if (!key || !requestId) {
    return;
  }
  if (action === 'get') {
    chrome.storage.local.get([key], result => {
      window.postMessage({
        type: 'WOS_AIDE_QUICKLOAD_STORAGE_RESPONSE',
        requestId,
        value: result[key] || null
      }, '*');
    });
    return;
  }
  if (action === 'set') {
    chrome.storage.local.set({ [key]: value }, () => {
      window.postMessage({
        type: 'WOS_AIDE_QUICKLOAD_STORAGE_RESPONSE',
        requestId,
        value: true
      }, '*');
    });
  }
});
// 监听网页window.postMessage的DOI列表消息，并转发给插件
window.addEventListener('message', (event) => {
  if (!isSameWindowMessage(event) || !isWosPage()) {
    return;
  }
  if (event?.data?.type === 'WOS_AIDE_DOI_LIST' && Array.isArray(event.data.doiList)) {
    // 存储到chrome.storage.local，供popup读取
    chrome.storage.local.set({ wosAideDoiList: event.data.doiList });
  }
});
'use strict';

// Content script file will run in the context of web page.
// With content script you can manipulate the web pages using
// Document Object Model (DOM).
// You can also pass information to the parent extension.

// We execute this script by making an entry in manifest.json file
// under `content_scripts` property

// For more information on Content Scripts,
// See https://developer.chrome.com/extensions/content_scripts

// Log `title` of current active web page
const pageTitle = document.head?.getElementsByTagName('title')[0]?.innerHTML || '';

const hasFontAwesome = () => {
  if (window.FontAwesome || window.__fortawesome__) return true;
  if (document.querySelector('link[href*="fontawesome"], style[data-fa], style[id*="fontawesome"]')) {
    return true;
  }
  const probe = document.createElement('i');
  probe.className = 'fa-solid fa-gear';
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.documentElement.appendChild(probe);
  const fontFamily = getComputedStyle(probe).getPropertyValue('font-family') || '';
  probe.remove();
  return /Font Awesome/i.test(fontFamily);
};

// Ensure Font Awesome CSS/JS is injected via background (avoids CSP issues on strict sites)
if (!hasFontAwesome()) {
  chrome.runtime.sendMessage({ type: 'ENSURE_FONT_AWESOME' }, () => {});
}

// Communicate with background file by sending a message
chrome.runtime.sendMessage(
  {
    type: 'GREETINGS',
    payload: {
      message: 'Hello, my name is Con. I am from ContentScript.',
    },
  },
  response => {
    console.log(response.message);
  }
);

// ========== 模块管理系统 ==========

/**
 * 模块配置 - 与 module-registry.js 保持一致
 */
const MODULES = {
  easyscholar: {
    id: 'easyscholar',
    name: 'EasyScholar',
    files: ['pub-fun.js', 'z-easyscholar.js'],
    elementId: 'wos_easyscholar_panel',
    visibilityKey: 'wos-easyscholar-panel-visible',
    enabledKey: 'easyscholarEnabled',
    eventName: '__EASYSCHOLAR_VISIBILITY__',
    injectMarker: 'easyscholar-inject'
  },
  
  wosDoiQuery: {
    id: 'wosDoiQuery',
    name: 'DOI Batch Query',
    files: ['pub-fun.js', 'z-easyscholar.js', 'z-wos-doi-query.js'],
    elementId: 'clipboard-reader-box',
    visibilityKey: 'clipboard-reader-box-visible',
    enabledKey: 'wosDoiQueryEnabled',
    eventName: '__WOS_DOI_QUERY_VISIBILITY__',
    injectMarker: 'wos-doi-query-inject'
  },

  doiPdfDownload: {
    id: 'doiPdfDownload',
    name: 'DOI PDF Download',
    files: ['pub-fun.js', 'z-doi-pdf-download.js'],
    elementId: 'ref-paper-downloader',
    visibilityKey: 'pdf_download_panel_visible',
    enabledKey: 'doiPdfDownloadEnabled',
    eventName: '__DOI_PDF_DOWNLOAD_VISIBILITY__',
    injectMarker: 'doi-pdf-download-inject'
  },

  openaiChat: {
    id: 'openaiChat',
    name: 'OpenAI Chat',
    files: ['pub-fun.js', 'z-chat.js'],
    elementId: 'wos_openai_panel',
    visibilityKey: 'wos-openai-panel-visible',
    enabledKey: 'openaiChatEnabled',
    eventName: '__OPENAI_CHAT_VISIBILITY__',
    injectMarker: 'openai-chat-inject'
  }
};

let isBridgeReady = false;
let bridgePromise = null;

const CHAT_API_KEY_STORAGE_KEY = 'wosOpenaiApiKey';
const CHAT_MODEL_STORAGE_KEY = 'wosOpenaiChatModel';
const GENERATE_WOS_QUERY_REQUEST_EVENT = '__WOS_AIDE_GENERATE_WOS_QUERY_REQUEST__';
const GENERATE_WOS_QUERY_RESPONSE_EVENT = '__WOS_AIDE_GENERATE_WOS_QUERY_RESPONSE__';
const FETCH_EASYSCHOLAR_RANK_REQUEST_EVENT = '__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_REQUEST__';
const FETCH_EASYSCHOLAR_RANK_RESPONSE_EVENT = '__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_RESPONSE__';
const WOS_TOOLBAR_SHORTCUTS_ID = 'wos-aide-toolbar-shortcuts';
const WOS_TOOLBAR_SHORTCUTS_STYLE_ID = 'wos-aide-toolbar-shortcuts-style';
const WOS_FONT_AWESOME_LINK_ID = 'wosAide-fontawesome';
const WOS_DOI_QUERY_PANEL_MODE_EVENT = '__WOS_DOI_QUERY_PANEL_MODE__';
const WOS_DOI_QUERY_PANEL_STATE_EVENT = '__WOS_DOI_QUERY_PANEL_STATE__';
const GET_WOS_SID_INFO_REQUEST_EVENT = '__WOS_AIDE_GET_SID_INFO__';
const GET_WOS_SID_INFO_RESPONSE_EVENT = '__WOS_AIDE_GET_SID_INFO_RESPONSE__';
let isEasyScholarEnabledForToolbar = false;
let isWosQueryEnabledForToolbar = false;
let currentToolbarPanelMode = 'batch';
let currentToolbarPanelTab = '';
let fontAwesomeReadyPromise = null;
const isJournalQueryAvailableForToolbar = () => isEasyScholarEnabledForToolbar;

const isWosQueryAvailableForToolbar = () => isWosQueryEnabledForToolbar;

const resolveDefaultWosPanelTab = (preferredTab) => {
  if (preferredTab) {
    return preferredTab;
  }
  if (isWosQueryAvailableForToolbar()) {
    return 'builder';
  }
  if (isJournalQueryAvailableForToolbar()) {
    return 'journal';
  }
  return 'query';
};

const getWosToolbarShortcutDefinitions = () => {
  const buttons = [
    {
      id: 'doi-query',
      title: 'DOI Query',
      iconHtml: '<i class="fa-solid fa-magnifying-glass wos-aide-toolbar-icon" aria-hidden="true"></i>',
      preferredTab: 'query'
    },
    {
      id: 'wos-export',
      title: 'WOS Data Export',
      iconHtml: '<i class="fa-regular fa-circle-down wos-aide-toolbar-icon" aria-hidden="true"></i>',
      preferredTab: 'export'
    },
    {
      id: 'sid-info',
      title: 'SID Info',
      iconHtml: '<i class="fa-solid fa-circle-info wos-aide-toolbar-icon" aria-hidden="true"></i>',
      action: 'sid-info'
    }
  ];

  if (isJournalQueryAvailableForToolbar()) {
    buttons.push({
      id: 'journal-query',
      title: 'Journal Query',
      iconHtml: '<i class="fa-regular fa-newspaper wos-aide-toolbar-icon" aria-hidden="true"></i>',
      preferredTab: 'journal'
    });
  }

  if (isWosQueryAvailableForToolbar()) {
    buttons.push({
      id: 'wos-query',
      title: 'WOS Query',
      iconHtml: '<i class="fa-regular fa-comment-dots wos-aide-toolbar-icon" aria-hidden="true"></i>',
      preferredTab: 'builder'
    });
  }

  return buttons;
};

const waitForFontAwesomeReady = (attempt = 0) => new Promise((resolve) => {
  if (hasFontAwesome()) {
    resolve(true);
    return;
  }

  if (attempt >= 24) {
    resolve(false);
    return;
  }

  window.setTimeout(() => {
    waitForFontAwesomeReady(attempt + 1).then(resolve);
  }, attempt < 6 ? 60 : 120);
});

const ensurePageFontAwesome = () => {
  if (hasFontAwesome()) {
    return Promise.resolve(true);
  }

  if (fontAwesomeReadyPromise) {
    return fontAwesomeReadyPromise;
  }

  fontAwesomeReadyPromise = new Promise((resolve) => {
    const finalize = () => {
      waitForFontAwesomeReady().then((ready) => {
        if (ready) {
          resolve(true);
          return;
        }
        fontAwesomeReadyPromise = null;
        resolve(false);
      });
    };

    const existingLink = document.getElementById(WOS_FONT_AWESOME_LINK_ID);
    if (existingLink) {
      existingLink.addEventListener('load', finalize, { once: true });
      existingLink.addEventListener('error', () => {
        fontAwesomeReadyPromise = null;
        resolve(false);
      }, { once: true });
      finalize();
      return;
    }

    const link = document.createElement('link');
    link.id = WOS_FONT_AWESOME_LINK_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('all.min.css');
    link.addEventListener('load', finalize, { once: true });
    link.addEventListener('error', () => {
      fontAwesomeReadyPromise = null;
      resolve(false);
    }, { once: true });

    (document.head || document.documentElement).appendChild(link);
  });

  return fontAwesomeReadyPromise;
};

const getWosSidInfo = () => new Promise((resolve) => {
  const requestId = `sid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutId = window.setTimeout(() => {
    document.removeEventListener(GET_WOS_SID_INFO_RESPONSE_EVENT, handleResponse);
    resolve({
      sid: ''
    });
  }, 800);

  const handleResponse = (event) => {
    if (event?.detail?.requestId !== requestId) {
      return;
    }

    window.clearTimeout(timeoutId);
    document.removeEventListener(GET_WOS_SID_INFO_RESPONSE_EVENT, handleResponse);
    resolve({
      sid: String(event?.detail?.sid || '').trim()
    });
  };

  document.addEventListener(GET_WOS_SID_INFO_RESPONSE_EVENT, handleResponse);
  document.dispatchEvent(new CustomEvent(GET_WOS_SID_INFO_REQUEST_EVENT, {
    detail: { requestId }
  }));
});

const copyTextToClipboard = async (text) => {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(normalizedText);
    return true;
  } catch (error) {
    const fallback = document.createElement('textarea');
    fallback.value = normalizedText;
    fallback.setAttribute('readonly', 'readonly');
    fallback.style.position = 'fixed';
    fallback.style.top = '-9999px';
    fallback.style.opacity = '0';
    (document.body || document.documentElement).appendChild(fallback);
    fallback.focus();
    fallback.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (execError) {
      copied = false;
    }

    fallback.remove();
    return copied;
  }
};

const copyWosSidFromToolbar = async (button) => {
  if (button.dataset.copying === 'true') return;
  button.dataset.copying = 'true';
  const originalHtml = button.innerHTML;
  const originalTitle = button.title;
  const { sid } = await getWosSidInfo();
  const copied = Boolean(sid) && await copyTextToClipboard(sid);

  button.innerHTML = copied
    ? '<i class="fa-solid fa-check wos-aide-toolbar-icon" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-xmark wos-aide-toolbar-icon" aria-hidden="true"></i>';
  button.title = copied ? 'SID copied' : (sid ? 'SID copy failed' : 'SID not found');
  button.setAttribute('aria-label', button.title);
  button.classList.toggle('is-copy-success', copied);
  button.classList.toggle('is-copy-error', !copied);
  delete button.dataset.copying;

  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.innerHTML = originalHtml;
    button.title = originalTitle;
    button.setAttribute('aria-label', originalTitle);
    button.classList.remove('is-copy-success', 'is-copy-error');
  }, 1200);
};

const renderWosToolbarShortcutButtons = (shortcutsWrap) => {
  if (!shortcutsWrap) {
    return;
  }

  shortcutsWrap.replaceChildren();
  const buttons = getWosToolbarShortcutDefinitions();

  buttons.forEach(({ id, title, iconHtml, preferredTab, action }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wos-aide-toolbar-btn';
    button.dataset.wosAideShortcut = id;
    if (preferredTab) {
      button.dataset.wosAideTab = preferredTab;
    }
    if (action) {
      button.dataset.wosAideAction = action;
    }
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = iconHtml;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (action === 'sid-info') {
        await copyWosSidFromToolbar(button);
        return;
      }
      if (isWosToolbarShortcutPanelActive(preferredTab)) {
        hideWosDoiQueryPanel();
        return;
      }
      const rect = button.getBoundingClientRect();
      openWosDoiQueryPanel(preferredTab, 'single', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    });
    shortcutsWrap.appendChild(button);
  });

  syncWosToolbarShortcutActiveState();
};

const syncWosToolbarShortcutActiveState = () => {
  const shortcutsWrap = document.getElementById(WOS_TOOLBAR_SHORTCUTS_ID);
  if (!shortcutsWrap) {
    return;
  }

  const panelElement = document.getElementById(MODULES.wosDoiQuery.elementId);
  const isPanelVisible = Boolean(panelElement && panelElement.style.display !== 'none' && !panelElement.hidden);
  const activeTab = isPanelVisible && currentToolbarPanelMode === 'single' ? currentToolbarPanelTab : '';

  shortcutsWrap.querySelectorAll('.wos-aide-toolbar-btn').forEach((button) => {
    const isActive = Boolean(activeTab) && button.dataset.wosAideTab === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const isWosToolbarShortcutPanelActive = (tabName) => {
  const panelElement = document.getElementById(MODULES.wosDoiQuery.elementId);
  if (!panelElement || panelElement.style.display === 'none' || panelElement.hidden) {
    return false;
  }
  return currentToolbarPanelMode === 'single' && currentToolbarPanelTab === tabName;
};

const hideWosDoiQueryPanel = () => {
  const panelElement = document.getElementById(MODULES.wosDoiQuery.elementId);
  if (panelElement) {
    panelElement.style.display = 'none';
  }
  setModuleVisibility('wosDoiQuery', false);
  setModuleVisibility('easyscholar', false);
  currentToolbarPanelTab = '';
  syncWosToolbarShortcutActiveState();
};

const getCurrentWosDoiQueryPanelState = () => {
  const element = document.getElementById(MODULES.wosDoiQuery.elementId);
  if (!element || element.style.display === 'none' || element.hidden) {
    return { visible: false, mode: 'batch', tab: '' };
  }

  let panelState = { visible: true, mode: 'batch', tab: '' };
  const handler = (event) => {
    if (event?.detail?.requestState) {
      return;
    }
    panelState = {
      visible: event?.detail?.visible !== false,
      mode: event?.detail?.mode || 'batch',
      tab: event?.detail?.tab || ''
    };
    document.removeEventListener(WOS_DOI_QUERY_PANEL_STATE_EVENT, handler);
  };

  document.addEventListener(WOS_DOI_QUERY_PANEL_STATE_EVENT, handler);
  document.dispatchEvent(new CustomEvent(WOS_DOI_QUERY_PANEL_STATE_EVENT, {
    detail: { requestState: true }
  }));
  document.removeEventListener(WOS_DOI_QUERY_PANEL_STATE_EVENT, handler);
  return panelState;
};

/**
 * 确保 module-bridge 已加载
 */
const ensureBridge = () => {
  if (isBridgeReady) {
    return Promise.resolve();
  }
  if (bridgePromise) {
    return bridgePromise;
  }

  bridgePromise = new Promise((resolve) => {
    const existingBridge = document.querySelector('script[data-module-bridge="true"]');
    if (existingBridge) {
      existingBridge.addEventListener('load', () => {
        isBridgeReady = true;
        resolve();
      }, { once: true });
      return;
    }

    const bridge = document.createElement('script');
    bridge.src = chrome.runtime.getURL('module-bridge.js');
    bridge.dataset.moduleBridge = 'true';
    bridge.onload = function() {
      isBridgeReady = true;
      resolve();
      this.remove();
    };
    (document.head || document.documentElement).appendChild(bridge);
  });

  return bridgePromise;
};

document.addEventListener(GENERATE_WOS_QUERY_REQUEST_EVENT, (event) => {
  const requestId = event?.detail?.requestId;
  const text = event?.detail?.text || '';
  const provider = event?.detail?.provider || '';
  chrome.runtime.sendMessage(
    { type: 'GENERATE_WOS_QUERY', requestId, text, provider },
    (response) => {
      document.dispatchEvent(new CustomEvent(GENERATE_WOS_QUERY_RESPONSE_EVENT, {
        detail: {
          requestId,
          success: Boolean(response?.success),
          rowText: response?.rowText || '',
          error: response?.error || ''
        }
      }));
    }
  );
});

document.addEventListener(FETCH_EASYSCHOLAR_RANK_REQUEST_EVENT, (event) => {
  const requestId = event?.detail?.requestId;
  const publicationName = event?.detail?.publicationName || '';
  chrome.runtime.sendMessage(
    { type: 'FETCH_EASYSCHOLAR_RANK', requestId, publicationName },
    (response) => {
      document.dispatchEvent(new CustomEvent(FETCH_EASYSCHOLAR_RANK_RESPONSE_EVENT, {
        detail: {
          requestId,
          success: Boolean(response?.success),
          result: response?.result || null,
          error: response?.error || ''
        }
      }));
    }
  );
});
/**
 * 设置模块可见性
 */
const setModuleVisibility = (moduleId, visible) => {
  const module = MODULES[moduleId];
  if (!module) {
    console.error(`[ContentScript] Unknown module: ${moduleId}`);
    return;
  }

  // 发送可见性事件到页面脚本
  ensureBridge().then(() => {
    document.dispatchEvent(new CustomEvent(module.eventName, {
      detail: { visible }
    }));
  });
};

const requireWosPage = (sendResponse, featureName) => {
  if (isWosPage()) {
    return true;
  }
  sendResponse({
    success: false,
    error: `${featureName} is available only on Web of Science pages.`
  });
  return false;
};

/**
 * 注入模块的 JS 文件
 */
const injectModule = (moduleId) => {
  const module = MODULES[moduleId];
  if (!module) {
    console.error(`[ContentScript] Unknown module: ${moduleId}`);
    return;
  }

  // 检查是否已注入
  if (document.getElementById(module.elementId)) {
    return;
  }
  const existingMarker = document.querySelector(`script[data-inject="${module.injectMarker}"]`);
  if (existingMarker) {
    return;
  }

  // 顺序注入文件
  const injectFiles = (files, index = 0) => {
    if (index >= files.length) {
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(files[index]);
    script.dataset.inject = module.injectMarker;
    script.onload = function() {
      if (index < files.length - 1) {
        injectFiles(files, index + 1);
      }
      this.remove();
    };
    script.onerror = function() {
      console.error(`[ContentScript] Failed to inject ${files[index]} for ${module.name}`);
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  };

  injectFiles(module.files);
};

/**
 * 获取模块状态
 */
const getModuleState = (moduleId) => {
  const module = MODULES[moduleId];
  if (!module) {
    return { exists: false, visible: false };
  }

  const element = document.getElementById(module.elementId);
  if (!element) {
    return { exists: false, visible: false };
  }
  const isHidden = element.style.display === 'none' || element.hidden;
  return { exists: true, visible: !isHidden };
};

const openWosDoiQueryPanel = (preferredTab, presentation = 'batch', anchorRect = null) => {
  const resolvedTab = resolveDefaultWosPanelTab(preferredTab);
  const element = document.getElementById(MODULES.wosDoiQuery.elementId);
  const switchTab = () => {
    document.dispatchEvent(new CustomEvent(WOS_DOI_QUERY_PANEL_MODE_EVENT, {
      detail: { mode: presentation, tab: resolvedTab, anchorRect }
    }));
    document.dispatchEvent(new CustomEvent('__WOS_DOI_QUERY_SWITCH_TAB__', {
      detail: { tab: resolvedTab }
    }));
  };

  const showPanel = () => {
    setModuleVisibility('wosDoiQuery', true);
    if (resolvedTab === 'journal') {
      setModuleVisibility('easyscholar', true);
    }
    switchTab();
  };

  if (element) {
    element.style.display = 'flex';
    showPanel();
    return { success: true, visible: true, action: 'shown' };
  }

  injectModule('wosDoiQuery');
  setTimeout(showPanel, 100);
  return { success: true, visible: true, action: 'injected' };
};

const ensureWosToolbarShortcutsReady = () => {
  if (!isWosPage()) {
    return false;
  }
  ensureWosToolbarShortcuts();
  return Boolean(document.getElementById(WOS_TOOLBAR_SHORTCUTS_ID));
};

const toggleWosDoiQueryPanel = (preferredTab) => {
  const resolvedTab = resolveDefaultWosPanelTab(preferredTab);
  const element = document.getElementById(MODULES.wosDoiQuery.elementId);
  const switchTab = () => {
    document.dispatchEvent(new CustomEvent('__WOS_DOI_QUERY_SWITCH_TAB__', {
      detail: { tab: resolvedTab }
    }));
  };

  if (element) {
    const nextVisible = element.style.display === 'none';
    element.style.display = nextVisible ? 'flex' : 'none';
    setModuleVisibility('wosDoiQuery', nextVisible);
    if (nextVisible && resolvedTab === 'journal') {
      setModuleVisibility('easyscholar', true);
    }
    if (nextVisible) {
      switchTab();
    }
    return { success: true, visible: nextVisible, action: 'toggled' };
  }

  injectModule('wosDoiQuery');
  setTimeout(() => {
    setModuleVisibility('wosDoiQuery', true);
    if (resolvedTab === 'journal') {
      setModuleVisibility('easyscholar', true);
    }
    switchTab();
  }, 100);
  return { success: true, visible: true, action: 'injected' };
};

const ensureWosToolbarShortcutsStyle = () => {
  if (document.getElementById(WOS_TOOLBAR_SHORTCUTS_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = WOS_TOOLBAR_SHORTCUTS_STYLE_ID;
  style.textContent = `
#${WOS_TOOLBAR_SHORTCUTS_ID} {
  position: fixed;
  top: 0;
  left: 50%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: auto;
  margin: 0;
  padding: 6px;
  transform: translateX(-50%);
  z-index: 999998;
  border: 1px solid rgba(74, 59, 136, 0.14);
  border-radius: 0 0 14px 14px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(33, 30, 53, 0.16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #4a3b88;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: none;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, border-radius 0.16s ease;
  padding: 0;
  appearance: none;
  box-sizing: border-box;
  outline: none;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent;
  margin: 0;
  flex: 0 0 auto;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn:hover {
  background: #f1f1f4;
  border-radius: 999px;
  color: #4a3b88;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn:active {
  background: #eef0f3;
  border: none;
  outline: none;
  box-shadow: none;
  border-radius: 999px;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn.is-active {
  background: #eef0f3;
  border: none;
  outline: none;
  box-shadow: none;
  border-radius: 999px;
  color: #4a3b88;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn:focus-visible {
  outline: none;
  border: none;
  box-shadow: none;
  background: #eef0f3;
  border-radius: 999px;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-icon {
  font-size: 20px;
  line-height: 1;
  display: inline-block;
  pointer-events: none;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn.is-copy-success {
  background: #edf7f0;
  color: #237a45;
}
#${WOS_TOOLBAR_SHORTCUTS_ID} .wos-aide-toolbar-btn.is-copy-error {
  background: #f8eeee;
  color: #a33a3a;
}
`;
  (document.head || document.documentElement).appendChild(style);
};

const ensureWosToolbarShortcuts = () => {
  if (!isWosPage()) {
    return;
  }

  if (!hasFontAwesome()) {
    ensurePageFontAwesome().then((ready) => {
      if (ready) {
        ensureWosToolbarShortcuts();
      }
    });
    return;
  }

  ensureWosToolbarShortcutsStyle();

  const existing = document.getElementById(WOS_TOOLBAR_SHORTCUTS_ID);
  if (existing) {
    const desiredShortcutIds = getWosToolbarShortcutDefinitions().map(({ id }) => id).join(',');
    const currentShortcutIds = Array.from(existing.querySelectorAll('[data-wos-aide-shortcut]'))
      .map((button) => button.dataset.wosAideShortcut || '')
      .join(',');
    if (currentShortcutIds !== desiredShortcutIds) {
      renderWosToolbarShortcutButtons(existing);
    }
    syncWosToolbarShortcutActiveState();
    const mountRoot = document.body || document.documentElement;
    if (mountRoot && existing.parentElement !== mountRoot) {
      mountRoot.appendChild(existing);
    }
    return;
  }

  const shortcutsWrap = document.createElement('div');
  shortcutsWrap.id = WOS_TOOLBAR_SHORTCUTS_ID;
  renderWosToolbarShortcutButtons(shortcutsWrap);
  (document.body || document.documentElement).appendChild(shortcutsWrap);
};

document.addEventListener(WOS_DOI_QUERY_PANEL_MODE_EVENT, (event) => {
  currentToolbarPanelMode = event?.detail?.mode === 'single' ? 'single' : 'batch';
  if (event?.detail?.tab) {
    currentToolbarPanelTab = event.detail.tab;
  }
  requestAnimationFrame(() => {
    syncWosToolbarShortcutActiveState();
  });
});

document.addEventListener(WOS_DOI_QUERY_PANEL_STATE_EVENT, (event) => {
  if (event?.detail?.requestState) {
    return;
  }
  requestAnimationFrame(() => {
    syncWosToolbarShortcutActiveState();
  });
});

document.addEventListener('__WOS_DOI_QUERY_SWITCH_TAB__', (event) => {
  if (event?.detail?.tab) {
    currentToolbarPanelTab = event.detail.tab;
  }
  requestAnimationFrame(() => {
    syncWosToolbarShortcutActiveState();
  });
});

let wosToolbarBootstrapStarted = false;
let wosToolbarRetryTimer = null;
let wosToolbarAnimationFrameId = null;
let wosToolbarHeartbeatTimer = null;

const scheduleWosToolbarShortcutMount = (attempt = 0) => {
  if (!isWosPage()) {
    return;
  }

  ensureWosToolbarShortcuts();
  if (document.getElementById(WOS_TOOLBAR_SHORTCUTS_ID)) {
    return;
  }

  if (attempt >= 20) {
    return;
  }

  if (wosToolbarRetryTimer) {
    clearTimeout(wosToolbarRetryTimer);
  }

  const delay = attempt < 5 ? 120 : 300;
  wosToolbarRetryTimer = setTimeout(() => {
    scheduleWosToolbarShortcutMount(attempt + 1);
  }, delay);
};

const pollWosToolbarShortcutMount = (frameCount = 0) => {
  if (!isWosPage()) {
    return;
  }

  ensureWosToolbarShortcuts();
  if (document.getElementById(WOS_TOOLBAR_SHORTCUTS_ID)) {
    wosToolbarAnimationFrameId = null;
    return;
  }

  if (frameCount >= 180) {
    wosToolbarAnimationFrameId = null;
    return;
  }

  wosToolbarAnimationFrameId = window.requestAnimationFrame(() => {
    pollWosToolbarShortcutMount(frameCount + 1);
  });
};

const bootstrapWosToolbarShortcuts = () => {
  if (!isWosPage() || wosToolbarBootstrapStarted) {
    return;
  }
  wosToolbarBootstrapStarted = true;

  scheduleWosToolbarShortcutMount(0);
  pollWosToolbarShortcutMount(0);

  const toolbarObserver = new MutationObserver(() => {
    ensureWosToolbarShortcuts();
  });

  const observeTarget = document.body || document.documentElement;
  if (observeTarget) {
    toolbarObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  window.addEventListener('load', () => {
    scheduleWosToolbarShortcutMount(0);
    pollWosToolbarShortcutMount(0);
  });

  window.addEventListener('pageshow', () => {
    scheduleWosToolbarShortcutMount(0);
    pollWosToolbarShortcutMount(0);
  });

  window.addEventListener('DOMContentLoaded', () => {
    scheduleWosToolbarShortcutMount(0);
    pollWosToolbarShortcutMount(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scheduleWosToolbarShortcutMount(0);
      pollWosToolbarShortcutMount(0);
    }
  });

  if (wosToolbarHeartbeatTimer) {
    clearInterval(wosToolbarHeartbeatTimer);
  }

  wosToolbarHeartbeatTimer = window.setInterval(() => {
    if (!isWosPage() || document.hidden) {
      return;
    }
    ensureWosToolbarShortcuts();
  }, 1500);
};

// ========== 消息监听 ==========

// Listen for message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING_WOS_AIDE') {
    sendResponse({ success: true });
    return true;
  }

  // EasyScholar 相关消息
  if (request.type === 'GET_EASYSCHOLAR_PANEL_STATE') {
    const state = getModuleState('easyscholar');
    sendResponse({ success: true, visible: state.visible, exists: state.exists });
    return true;
  }

  if (request.type === 'OPEN_EASYSCHOLAR') {
    if (!requireWosPage(sendResponse, 'EasyScholar')) {
      return true;
    }
    sendResponse(openWosDoiQueryPanel('journal'));
    return true;
  }

  if (request.type === 'CLOSE_EASYSCHOLAR') {
    const element = document.getElementById(MODULES.wosDoiQuery.elementId);
    if (element) {
      element.remove();
      const easyScholarElement = document.getElementById(MODULES.easyscholar.elementId);
      if (easyScholarElement) {
        easyScholarElement.remove();
      }
      setModuleVisibility('wosDoiQuery', false);
      setModuleVisibility('easyscholar', false);
      sendResponse({ success: true, action: 'removed' });
      return true;
    }
    setModuleVisibility('easyscholar', false);
    sendResponse({ success: true, action: 'noop' });
    return true;
  }

  if (request.type === 'TOGGLE_EASYSCHOLAR_PANEL') {
    if (!requireWosPage(sendResponse, 'EasyScholar')) {
      return true;
    }
    const element = document.getElementById(MODULES.wosDoiQuery.elementId);
    if (element) {
      const isVisible = element.style.display !== 'none';
      const nextVisible = !isVisible;
      element.style.display = nextVisible ? 'flex' : 'none';
      if (nextVisible) {
        document.dispatchEvent(new CustomEvent('__WOS_DOI_QUERY_SWITCH_TAB__', {
          detail: { tab: 'journal' }
        }));
      }
      setModuleVisibility('wosDoiQuery', nextVisible);
      setModuleVisibility('easyscholar', nextVisible);
      sendResponse({ success: true, visible: nextVisible });
      return true;
    }

    injectModule('wosDoiQuery');
    setTimeout(() => {
      setModuleVisibility('wosDoiQuery', true);
      setModuleVisibility('easyscholar', true);
      document.dispatchEvent(new CustomEvent('__WOS_DOI_QUERY_SWITCH_TAB__', {
        detail: { tab: 'journal' }
      }));
    }, 100);
    sendResponse({ success: true, visible: true, action: 'injected' });
    return true;
  }

  // WOS DOI Query 相关消息
  if (request.type === 'GET_WOS_DOI_QUERY_STATE') {
    const state = getModuleState('wosDoiQuery');
    sendResponse({ success: true, visible: state.visible, exists: state.exists });
    return true;
  }

  if (request.type === 'OPEN_WOS_DOI_QUERY') {
    if (!requireWosPage(sendResponse, 'DOI Batch Query')) {
      return true;
    }
    const toolbarShortcutsReady = ensureWosToolbarShortcutsReady();
    if (toolbarShortcutsReady) {
      sendResponse({
        success: true,
        visible: false,
        action: 'toolbar-ready',
        toolbarShortcutsReady: true
      });
      return true;
    }
    sendResponse(openWosDoiQueryPanel(request.preferredTab));
    return true;
  }

  if (request.type === 'CLOSE_WOS_DOI_QUERY') {
    const element = document.getElementById(MODULES.wosDoiQuery.elementId);
    if (element) {
      element.remove();
      const easyScholarElement = document.getElementById(MODULES.easyscholar.elementId);
      if (easyScholarElement) {
        easyScholarElement.remove();
      }
      setModuleVisibility('wosDoiQuery', false);
      setModuleVisibility('easyscholar', false);
      sendResponse({ success: true, action: 'removed' });
      return true;
    }
    setModuleVisibility('wosDoiQuery', false);
    setModuleVisibility('easyscholar', false);
    sendResponse({ success: true, action: 'noop' });
    return true;
  }

  // DOI PDF Download 相关消息
  if (request.type === 'GET_DOI_PDF_DOWNLOAD_STATE') {
    const state = getModuleState('doiPdfDownload');
    sendResponse({ success: true, visible: state.visible, exists: state.exists });
    return true;
  }

  if (request.type === 'OPEN_DOI_PDF_DOWNLOAD') {
    const element = document.getElementById(MODULES.doiPdfDownload.elementId);
    if (element) {
      element.style.display = 'flex';
      setModuleVisibility('doiPdfDownload', true);
      sendResponse({ success: true, action: 'shown' });
      return true;
    }

    // 注入模块，然后等待一个短暂的时间再发送可见性事件
    injectModule('doiPdfDownload');
    setTimeout(() => {
      setModuleVisibility('doiPdfDownload', true);
    }, 100);
    sendResponse({ success: true, action: 'injected' });
    return true;
  }

  if (request.type === 'CLOSE_DOI_PDF_DOWNLOAD') {
    const element = document.getElementById(MODULES.doiPdfDownload.elementId);
    if (element) {
      element.style.display = 'none';
      setModuleVisibility('doiPdfDownload', false);
      sendResponse({ success: true, action: 'hidden' });
      return true;
    }
    setModuleVisibility('doiPdfDownload', false);
    sendResponse({ success: true, action: 'noop' });
    return true;
  }

  // OpenAI Chat 相关消息
  if (request.type === 'GET_OPENAI_CHAT_STATE') {
    const state = getModuleState('openaiChat');
    sendResponse({ success: true, visible: state.visible, exists: state.exists });
    return true;
  }

  if (request.type === 'OPEN_OPENAI_CHAT') {
    if (!requireWosPage(sendResponse, 'OpenAI Chat')) {
      return true;
    }
    const element = document.getElementById(MODULES.openaiChat.elementId);
    if (element) {
      element.style.display = 'flex';
      setModuleVisibility('openaiChat', true);
      sendResponse({ success: true, action: 'shown' });
      return true;
    }

    injectModule('openaiChat');
    setTimeout(() => {
      setModuleVisibility('openaiChat', true);
    }, 100);
    sendResponse({ success: true, action: 'injected' });
    return true;
  }

  if (request.type === 'CLOSE_OPENAI_CHAT') {
    const element = document.getElementById(MODULES.openaiChat.elementId);
    if (element) {
      element.style.display = 'none';
      setModuleVisibility('openaiChat', false);
      sendResponse({ success: true, action: 'hidden' });
      return true;
    }
    setModuleVisibility('openaiChat', false);
    sendResponse({ success: true, action: 'noop' });
    return true;
  }

  if (request.type === 'GET_WOS_AIDE_PROJECT') {
    const listener = (event) => {
      document.removeEventListener('__WOS_AIDE_PROJECT_RESPONSE__', listener);
      if (event.detail.success) {
        sendResponse({ success: true, projectName: event.detail.projectName });
      } else {
        sendResponse({ success: false, error: event.detail.error || 'Project not found' });
      }
    };

    document.addEventListener('__WOS_AIDE_PROJECT_RESPONSE__', listener);
    document.dispatchEvent(new CustomEvent('__GET_WOS_AIDE_PROJECT__'));
    return true;
  }

  if (request.type === 'PICK_WOS_AIDE_DIRECTORY') {
    const listener = (event) => {
      document.removeEventListener('__WOS_AIDE_PICK_DIR_RESPONSE__', listener);
      if (event.detail.success) {
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: event.detail.error || 'Directory not selected' });
      }
    };

    document.addEventListener('__WOS_AIDE_PICK_DIR_RESPONSE__', listener);
    document.dispatchEvent(new CustomEvent('__WOS_AIDE_PICK_DIR__'));
    return true;
  }

  // Send an empty response
  // See https://github.com/mozilla/webextension-polyfill/issues/130#issuecomment-531531890
  sendResponse({});
  return true;
});

// ========== 初始化：根据存储的状态自动加载模块 ==========

const isEditableTarget = (target) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

document.addEventListener('keydown', (event) => {
  if (!isWosPage()) {
    return;
  }
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
    return;
  }
  if (event.key !== '`' && event.code !== 'Backquote') {
    return;
  }
  if (isEditableTarget(event.target)) {
    return;
  }

  event.preventDefault();
  toggleWosDoiQueryPanel();
});

if (isWosPage()) {
  chrome.storage.local.get([
    'easyscholarEnabled',
    'wosQueryEnabled'
  ], result => {
    isEasyScholarEnabledForToolbar = Boolean(result.easyscholarEnabled);
    isWosQueryEnabledForToolbar = Boolean(result.wosQueryEnabled);
    bootstrapWosToolbarShortcuts();
    ensureWosToolbarShortcuts();
  });

  bootstrapWosToolbarShortcuts();
}

if (isWosPage()) {
  chrome.storage.local.get(['easyscholarEnabled'], result => {
    if (result.easyscholarEnabled) {
      setModuleVisibility('easyscholar', true);
      injectModule('easyscholar');
    }
  });

  chrome.storage.local.get(['openaiChatEnabled'], result => {
    if (result.openaiChatEnabled) {
      setModuleVisibility('openaiChat', true);
      injectModule('openaiChat');
    }
  });

  const notifyEnlightenkeyProject = (projectName) => {
    document.dispatchEvent(new CustomEvent('__WOS_AIDE_PROJECT_UPDATE__', {
      detail: { projectName }
    }));
  };

  chrome.storage.local.get(['wosAideProjectName'], result => {
    if (result.wosAideProjectName) {
      notifyEnlightenkeyProject(result.wosAideProjectName);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    let shouldRefreshToolbar = false;
    if (changes.easyscholarEnabled) {
      isEasyScholarEnabledForToolbar = Boolean(changes.easyscholarEnabled.newValue);
      shouldRefreshToolbar = true;
    }
    if (changes.wosQueryEnabled) {
      isWosQueryEnabledForToolbar = Boolean(changes.wosQueryEnabled.newValue);
      shouldRefreshToolbar = true;
    }
    if (changes.wosAideProjectName) {
      notifyEnlightenkeyProject(changes.wosAideProjectName.newValue || null);
    }
    if (shouldRefreshToolbar) {
      ensureWosToolbarShortcuts();
    }
  });

  // Load the external injected script only on WoS-related pages.
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

chrome.storage.local.get(['doiPdfDownloadEnabled'], result => {
  if (result.doiPdfDownloadEnabled) {
    setModuleVisibility('doiPdfDownload', true);
    injectModule('doiPdfDownload');
  }
});

// Inject ChatGPT prompts quickload helper on chatgpt.com
if (location.hostname === 'chatgpt.com' || location.hostname.endsWith('.chatgpt.com')) {
  const existingQuickload = document.querySelector('script[data-inject="chatgpt-prompts-quickload"]');
  if (!existingQuickload) {
    const quickloadScript = document.createElement('script');
    quickloadScript.src = chrome.runtime.getURL('chatgpt-prompts-quickload.js');
    quickloadScript.dataset.inject = 'chatgpt-prompts-quickload';
    quickloadScript.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(quickloadScript);
  }
}
