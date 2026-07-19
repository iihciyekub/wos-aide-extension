// 导出 WOS Plain Text 到控制台（不下载文件）
async function exportWosPlainTextToConsole() {
    try {
        let plainText = '';
        // 兼容 window.wos.getPlaintext 或 window.wos.data.plaintext
        if (window.wos && typeof window.wos.getPlaintext === 'function') {
            plainText = await window.wos.getPlaintext();
        } else if (window.wos && window.wos.data && window.wos.data.plaintext) {
            plainText = window.wos.data.plaintext;
        }
        if (plainText) {
            console.log('[WOS Plain Text] Export: success');
        } else {
            console.log('[WOS Plain Text] Export: no data found');
        }
    } catch (err) {
        console.log('[WOS Plain Text] Export: failed', err);
    }
}
/**
 * Web of Science 
 * 批量输入 doi 在 WoS 批量查询的工具栏
 */

// 全局变量存储剪贴板数据
window.wosids = [];

// 剪贴板读取功能
(function () {
    // ========== 导出目录选择（与 popup 共用） ==========
    let exportDirHandle = null;
    let exportDirName = '';
    const PANEL_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    const styleId = 'clipboard-reader-box-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
#clipboard-reader-box,
#clipboard-reader-box button,
#clipboard-reader-box input,
#clipboard-reader-box textarea,
#clipboard-reader-box select,
#clipboard-reader-box div,
#clipboard-reader-box span,
#clipboard-reader-box label,
#clipboard-reader-box table,
#clipboard-reader-box th,
#clipboard-reader-box td {
    font-family: ${PANEL_FONT_STACK} !important;
    font-size: 14px !important;
}
#clipboard-reader-box i,
#clipboard-reader-box .fa-solid,
#clipboard-reader-box .fa-regular,
#clipboard-reader-box .fa-brands {
    font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands" !important;
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    const openProjectHandleStore = async () => new Promise((resolve, reject) => {
        const request = indexedDB.open('wosaide-toolkit', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('projectHandles');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const setStoredProjectHandle = async (handle) => {
        if (!handle) return;
        const db = await openProjectHandleStore();
        await new Promise((resolve) => {
            const tx = db.transaction('projectHandles', 'readwrite');
            const store = tx.objectStore('projectHandles');
            store.put(handle, 'default');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    };

    const loadStoredProjectHandle = async () => {
        try {
            const db = await openProjectHandleStore();
            return await new Promise((resolve) => {
                const tx = db.transaction('projectHandles', 'readonly');
                const store = tx.objectStore('projectHandles');
                const req = store.get('default');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (error) {
            console.warn("[WOS DOI Query] Failed to load directory handle:", error);
            return null;
        }
    };

    const ensureDirectoryPermission = async (handle) => {
        try {
            const opts = { mode: 'readwrite' };
            if (await handle.queryPermission(opts) === 'granted') return true;
            return (await handle.requestPermission(opts)) === 'granted';
        } catch (error) {
            console.warn("[WOS DOI Query] Directory permission check failed:", error);
            return false;
        }
    };

    const chooseExportDirectory = async () => {
        if (!window.showDirectoryPicker) {
            throw new Error('当前浏览器不支持目录选择');
        }
        const handle = await window.showDirectoryPicker({ id: 'wosAide-project', mode: 'readwrite' });
        const granted = await ensureDirectoryPermission(handle);
        if (!granted) {
            throw new Error('无写入权限');
        }
        exportDirHandle = handle;
        exportDirName = handle.name || '';
        window.wosAideDirectoryHandle = handle;
        await setStoredProjectHandle(handle);
        return handle;
    };

    window.wosDoiQuery = window.wosDoiQuery || {};
    window.wosDoiQuery.selectExportDirectory = chooseExportDirectory;
    const readStorage = (key, fallback) => {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (error) {
            console.warn("Failed to read localStorage:", error);
            return fallback;
        }
    };

    const writeStorage = (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn("Failed to write localStorage:", error);
        }
    };

    const requestStorage = (action, key, value) => new Promise((resolve) => {
        const requestId = `wosaide-wos-doi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const handler = (event) => {
            if (!event?.data || event.data.type !== "WOS_AIDE_QUICKLOAD_STORAGE_RESPONSE") {
                return;
            }
            if (event.data.requestId !== requestId) {
                return;
            }
            window.removeEventListener("message", handler);
            resolve(event.data.value);
        };
        window.addEventListener("message", handler);
        window.postMessage({
            type: "WOS_AIDE_QUICKLOAD_STORAGE",
            action,
            key,
            value,
            requestId
        }, "*");
        setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve(null);
        }, 1200);
    });

    // 检查并删除已存在的实例
    const existing = document.getElementById("clipboard-reader-box");
    if (existing) {
        existing.remove();
        console.log("clipboard reader, reloading");
    }

    // 从 localStorage 读取保存的位置和显示状态
    const POSITION_TOP_KEY = "clipboard-reader-box-top";
    const POSITION_LEFT_KEY = "clipboard-reader-box-left";
    const WIDTH_KEY = "clipboard-reader-box-width";
    const HEIGHT_KEY = "clipboard-reader-box-height";
    const COLLAPSED_KEY = "clipboard-reader-box-collapsed";
    const VISIBILITY_KEY = "clipboard-reader-box-visible";
    const SINGLE_PANEL_LAYOUT_PREFIX = "clipboard-reader-box-single-layout";
    const HISTORY_KEY = "clipboard-reader-box-history";
    const WOS_QUERY_HISTORY_KEY = "wos-query-builder-history";
    const EASYSCHOLAR_VERIFIED_KEY = "wos-easyscholar-api-key-verified";
    const EASYSCHOLAR_ENABLED_KEY = "easyscholarEnabled";
    const EASYSCHOLAR_SYNC_EVENT = "__EASYSCHOLAR_API_KEY_SYNC__";
    const CHAT_API_KEY_STORAGE_KEY = "wosOpenaiApiKey";
    const CHAT_MODEL_STORAGE_KEY = "wosOpenaiChatModel";
    const WOS_QUERY_PROVIDER_STORAGE_KEY = "wosQueryProvider";
    const WOS_QUERY_ENABLED_KEY = "wosQueryEnabled";
    const WOS_QUERY_OPENAI_VERIFIED_KEY = "wosOpenaiVerified";
    const WOS_QUERY_LMSTUDIO_VERIFIED_KEY = "wosLmStudioVerified";
    const WOS_QUERY_ACCESS_SYNC_EVENT = "__WOS_QUERY_ACCESS_SYNC__";
    const JOURNAL_LAYOUT_SYNC_EVENT = "__WOS_AIDE_JOURNAL_LAYOUT_SYNC__";
    const PANEL_MODE_EVENT = "__WOS_DOI_QUERY_PANEL_MODE__";
    const PANEL_STATE_EVENT = "__WOS_DOI_QUERY_PANEL_STATE__";
    const LM_STUDIO_BASE_URL_STORAGE_KEY = "wosLmStudioBaseUrl";
    const LM_STUDIO_MODEL_STORAGE_KEY = "wosLmStudioModel";
    const LM_STUDIO_API_KEY_STORAGE_KEY = "wosLmStudioApiKey";
    const MAX_HISTORY = 20;
    const savedTop = readStorage(POSITION_TOP_KEY, "80px");
    const savedLeft = readStorage(POSITION_LEFT_KEY, null);
    const savedWidth = readStorage(WIDTH_KEY, "260px");
    const savedHeight = readStorage(HEIGHT_KEY, "520px");
    const savedCollapsed = readStorage(COLLAPSED_KEY, "false") === "true";
    const savedVisible = readStorage(VISIBILITY_KEY, "false") === "true";
    const COLLAPSED_HEIGHT = 40;
    const SINGLE_PANEL_DEFAULTS = {
        query: { width: 320, height: 420 },
        export: { width: 700, height: 250 },
        journal: { width: 520, height: 420 },
        builder: { width: 500, height: 220 }
    };

    // 历史记录管理
    let queryHistory = [];
    let historyIndex = -1;
    let queryCurrentInput = "";
    let wosQueryHistory = [];
    let wosQueryHistoryIndex = -1;
    let wosQueryCurrentInput = "";

    function loadHistory() {
        try {
            const saved = readStorage(HISTORY_KEY, null);
            queryHistory = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load query history:", e);
            queryHistory = [];
        }
    }

    function saveHistory(queryText) {
        if (!queryText.trim()) return;

        // 移除重复项
        queryHistory = queryHistory.filter(item => item !== queryText);

        // 添加到历史开头
        queryHistory.unshift(queryText);

        // 限制历史记录数量
        if (queryHistory.length > MAX_HISTORY) {
            queryHistory = queryHistory.slice(0, MAX_HISTORY);
        }

        // 保存到 localStorage
        writeStorage(HISTORY_KEY, JSON.stringify(queryHistory));

        // 重置历史索引
        historyIndex = -1;
        queryCurrentInput = "";
    }

    function navigateHistory(direction) {
        if (queryHistory.length === 0) return;

        // direction: 1 = down (newer), -1 = up (older)
        if (direction === -1) {
            if (historyIndex === -1) {
                queryCurrentInput = textarea.value;
            }
            // 按上 - 查看更旧的历史
            if (historyIndex < queryHistory.length - 1) {
                historyIndex++;
                textarea.value = queryHistory[historyIndex];
            }
        } else if (direction === 1) {
            // 按下 - 查看更新的历史
            if (historyIndex > 0) {
                historyIndex--;
                textarea.value = queryHistory[historyIndex];
            } else if (historyIndex === 0) {
                historyIndex = -1;
                textarea.value = queryCurrentInput;
            }
        }
    }

    function loadWosQueryHistory() {
        try {
            const saved = readStorage(WOS_QUERY_HISTORY_KEY, null);
            wosQueryHistory = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load WOS query history:", e);
            wosQueryHistory = [];
        }
    }

    function saveWosQueryHistory(queryText) {
        if (!queryText.trim()) return;
        wosQueryHistory = wosQueryHistory.filter(item => item !== queryText);
        wosQueryHistory.unshift(queryText);
        if (wosQueryHistory.length > MAX_HISTORY) {
            wosQueryHistory = wosQueryHistory.slice(0, MAX_HISTORY);
        }
        writeStorage(WOS_QUERY_HISTORY_KEY, JSON.stringify(wosQueryHistory));
        wosQueryHistoryIndex = -1;
        wosQueryCurrentInput = "";
    }

    function navigateWosQueryHistory(direction) {
        if (wosQueryHistory.length === 0) return;

        if (direction === -1) {
            if (wosQueryHistoryIndex === -1) {
                wosQueryCurrentInput = wosQueryInput.value;
            }
            if (wosQueryHistoryIndex < wosQueryHistory.length - 1) {
                wosQueryHistoryIndex++;
                wosQueryInput.value = wosQueryHistory[wosQueryHistoryIndex];
            }
        } else if (direction === 1) {
            if (wosQueryHistoryIndex > 0) {
                wosQueryHistoryIndex--;
                wosQueryInput.value = wosQueryHistory[wosQueryHistoryIndex];
            } else if (wosQueryHistoryIndex === 0) {
                wosQueryHistoryIndex = -1;
                wosQueryInput.value = wosQueryCurrentInput;
            }
        }
    }

    function isCaretOnFirstLine(textareaEl) {
        const start = textareaEl.selectionStart || 0;
        return !textareaEl.value.slice(0, start).includes('\n');
    }

    function isCaretOnLastLine(textareaEl) {
        const start = textareaEl.selectionStart || 0;
        return !textareaEl.value.slice(start).includes('\n');
    }

    // 加载历史记录
    loadHistory();
    loadWosQueryHistory();

    // 创建主容器
    const box = document.createElement("div");
    box.id = "clipboard-reader-box";
    box.style.position = "fixed";
    const initialWidth = Math.max(260, parseInt(savedWidth, 10) || 260);
    const initialHeight = Math.max(320, parseInt(savedHeight, 10) || 520);
    const { top, left } = window.clampPanelPosition({
        top: savedTop,
        left: savedLeft,
        defaultTop: 80,
        defaultLeft: window.innerWidth - 360,
        width: initialWidth,
        height: initialHeight,
        margin: 0
    });
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
    box.style.right = "auto";
    box.style.zIndex = "999999";
    box.style.boxSizing = "border-box";
    box.style.fontFamily = PANEL_FONT_STACK;
    box.style.fontSize = '14px';
    box.style.background = "#ffffff";
    box.style.padding = "0";
    box.style.borderRadius = "2px";
    box.style.display = savedVisible ? "flex" : "none";
    box.style.flexDirection = "column";
    box.style.border = "none";
    box.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.10)";
    box.style.width = `${initialWidth}px`;
    box.style.height = `${savedCollapsed ? COLLAPSED_HEIGHT : initialHeight}px`;
    box.style.minWidth = "260px";
    box.style.minHeight = `${savedCollapsed ? COLLAPSED_HEIGHT : 320}px`;
    box.style.overflow = "hidden";
    box.style.transition = "box-shadow 0.12s ease";

    // 控制栏（标题和拖动按钮）
    const controlRow = document.createElement("div");
    controlRow.style.display = "flex";
    controlRow.style.alignItems = "center";
    controlRow.style.justifyContent = "space-between";
    controlRow.style.gap = "4px";
    controlRow.style.cursor = "move";
    controlRow.style.userSelect = "none";
    controlRow.style.height = "40px";
    controlRow.style.flexShrink = "0";
    controlRow.style.padding = "0 10px";
    controlRow.style.boxSizing = "border-box";
    controlRow.style.background = "#174b78";
    controlRow.style.borderBottom = "1px solid #123a5c";
    controlRow.style.borderRadius = "2px 2px 0 0";

    const title = document.createElement("span");
    title.textContent = "Batch Query";
    title.style.color = "#fff";
    title.style.fontSize = "12px";
    title.style.fontWeight = "bold";
    title.style.cursor = "move";

    const titleBtnGroup = document.createElement("div");
    titleBtnGroup.style.display = "flex";
    titleBtnGroup.style.alignItems = "center";
    titleBtnGroup.style.gap = "4px";

    const collapseBtn = document.createElement("button");
    collapseBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i>`;
    collapseBtn.style.background = "transparent";
    collapseBtn.style.border = "1px solid rgba(255,255,255,0.20)";
    collapseBtn.style.color = "#fff";
    collapseBtn.style.fontSize = "11px";
    collapseBtn.style.cursor = "pointer";
    collapseBtn.style.padding = "2px 6px";
    collapseBtn.style.borderRadius = "4px";
    collapseBtn.style.display = "inline-flex";
    collapseBtn.style.alignItems = "center";
    collapseBtn.style.justifyContent = "center";
    collapseBtn.title = "Collapse panel";

    const copySidBtn = document.createElement("button");
    copySidBtn.innerHTML = `<i class="fa-solid fa-copy"></i><span style="margin-left:4px;">SID</span>`;
    copySidBtn.style.background = "transparent";
    copySidBtn.style.border = "1px solid rgba(255,255,255,0.20)";
    copySidBtn.style.color = "#fff";
    copySidBtn.style.fontSize = "11px";
    copySidBtn.style.cursor = "pointer";
    copySidBtn.style.padding = "2px 6px";
    copySidBtn.style.borderRadius = "4px";
    copySidBtn.style.display = "inline-flex";
    copySidBtn.style.alignItems = "center";
    copySidBtn.style.justifyContent = "center";
    copySidBtn.title = "Copy SID";
    let copySidRestoreTimer = null;

    copySidBtn.onclick = async () => {
        const sid = String(window?.wos?.SID || window?.sessionData?.BasicProperties?.SID || '').trim();
        if (!sid) {
            alert('SID not found on current page.');
            return;
        }

        try {
            await navigator.clipboard.writeText(sid);
            if (copySidRestoreTimer) {
                clearTimeout(copySidRestoreTimer);
                copySidRestoreTimer = null;
            }
            copySidBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i><span style="margin-left:4px;">SID</span>`;
            copySidRestoreTimer = setTimeout(() => {
                copySidBtn.innerHTML = `<i class="fa-solid fa-copy"></i><span style="margin-left:4px;">SID</span>`;
                copySidRestoreTimer = null;
            }, 2000);
        } catch (error) {
            alert('Failed to copy SID.');
        }
    };

    // 关闭按钮
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "1px solid rgba(255,255,255,0.20)";
    closeBtn.style.color = "#fff";
    closeBtn.style.fontSize = "11px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "2px 6px";
    closeBtn.style.borderRadius = "4px";
    closeBtn.title = "Close panel";
    // onclick 将在后面定义

    const singlePanelCloseBtn = document.createElement("button");
    singlePanelCloseBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    singlePanelCloseBtn.style.position = "absolute";
    singlePanelCloseBtn.style.top = "8px";
    singlePanelCloseBtn.style.right = "8px";
    singlePanelCloseBtn.style.zIndex = "2";
    singlePanelCloseBtn.style.width = "24px";
    singlePanelCloseBtn.style.height = "24px";
    singlePanelCloseBtn.style.display = "none";
    singlePanelCloseBtn.style.alignItems = "center";
    singlePanelCloseBtn.style.justifyContent = "center";
    singlePanelCloseBtn.style.border = "1px solid rgba(23,75,120,0.12)";
    singlePanelCloseBtn.style.borderRadius = "999px";
    singlePanelCloseBtn.style.background = "#ffffff";
    singlePanelCloseBtn.style.color = "#5a6782";
    singlePanelCloseBtn.style.cursor = "pointer";
    singlePanelCloseBtn.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.08)";
    singlePanelCloseBtn.title = "Close panel";

    const singlePanelResetBtn = document.createElement("button");
    singlePanelResetBtn.innerHTML = `<i class="fa-solid fa-arrows-left-right-to-line"></i>`;
    singlePanelResetBtn.style.position = "absolute";
    singlePanelResetBtn.style.top = "8px";
    singlePanelResetBtn.style.right = "38px";
    singlePanelResetBtn.style.zIndex = "2";
    singlePanelResetBtn.style.width = "24px";
    singlePanelResetBtn.style.height = "24px";
    singlePanelResetBtn.style.display = "none";
    singlePanelResetBtn.style.alignItems = "center";
    singlePanelResetBtn.style.justifyContent = "center";
    singlePanelResetBtn.style.border = "1px solid rgba(23,75,120,0.12)";
    singlePanelResetBtn.style.borderRadius = "999px";
    singlePanelResetBtn.style.background = "#ffffff";
    singlePanelResetBtn.style.color = "#5a6782";
    singlePanelResetBtn.style.cursor = "pointer";
    singlePanelResetBtn.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.08)";
    singlePanelResetBtn.title = "Reset panel size";

    controlRow.appendChild(title);
    titleBtnGroup.appendChild(collapseBtn);
    titleBtnGroup.appendChild(copySidBtn);
    titleBtnGroup.appendChild(closeBtn);
    controlRow.appendChild(titleBtnGroup);
    box.appendChild(controlRow);
    box.appendChild(singlePanelResetBtn);
    box.appendChild(singlePanelCloseBtn);

    // Tab 容器
    const tabRow = document.createElement('div');
    tabRow.style.display = 'flex';
    tabRow.style.gap = '4px';
    tabRow.style.padding = '6px 8px 0';

    const queryTabBtn = document.createElement('button');
    queryTabBtn.textContent = 'DOI Query';
    queryTabBtn.style.flex = '1';
    queryTabBtn.style.padding = '3px 8px';
    queryTabBtn.style.border = '1px solid #c8d5e2';
    queryTabBtn.style.borderRadius = '2px';
    queryTabBtn.style.fontSize = '11px';
    queryTabBtn.style.cursor = 'pointer';
    queryTabBtn.style.outline = 'none';
    queryTabBtn.style.fontWeight = '600';

    const exportTabBtn = document.createElement('button');
    exportTabBtn.textContent = 'WOS Data Export';
    exportTabBtn.style.flex = '1';
    exportTabBtn.style.padding = '3px 8px';
    exportTabBtn.style.border = '1px solid #c8d5e2';
    exportTabBtn.style.borderRadius = '2px';
    exportTabBtn.style.fontSize = '11px';
    exportTabBtn.style.cursor = 'pointer';
    exportTabBtn.style.outline = 'none';
    exportTabBtn.style.fontWeight = '600';

    const journalTabBtn = document.createElement('button');
    journalTabBtn.textContent = 'Journal Query';
    journalTabBtn.style.flex = '1';
    journalTabBtn.style.padding = '3px 8px';
    journalTabBtn.style.border = '1px solid #c8d5e2';
    journalTabBtn.style.borderRadius = '2px';
    journalTabBtn.style.fontSize = '11px';
    journalTabBtn.style.cursor = 'pointer';
    journalTabBtn.style.outline = 'none';
    journalTabBtn.style.fontWeight = '600';

    const builderTabBtn = document.createElement('button');
    builderTabBtn.textContent = 'WOS Query';
    builderTabBtn.style.flex = '1';
    builderTabBtn.style.padding = '3px 8px';
    builderTabBtn.style.border = '1px solid #c8d5e2';
    builderTabBtn.style.borderRadius = '2px';
    builderTabBtn.style.fontSize = '11px';
    builderTabBtn.style.cursor = 'pointer';
    builderTabBtn.style.outline = 'none';
    builderTabBtn.style.fontWeight = '600';

    tabRow.appendChild(queryTabBtn);
    tabRow.appendChild(exportTabBtn);
    tabRow.appendChild(journalTabBtn);
    tabRow.appendChild(builderTabBtn);
    box.appendChild(tabRow);

    const tabContentWrap = document.createElement('div');
    tabContentWrap.style.display = 'flex';
    tabContentWrap.style.flexDirection = 'column';
    tabContentWrap.style.flex = '1';
    tabContentWrap.style.minHeight = '0';
    tabContentWrap.style.gap = '0';
    tabContentWrap.style.padding = '8px';
    tabContentWrap.style.paddingTop = '4px';
    tabContentWrap.style.overflow = 'auto';

    let resizeHandles = [];
    let isCollapsed = savedCollapsed;
    let expandedHeightPx = initialHeight;
    let currentPanelMode = 'batch';
    let currentActiveTab = 'query';
    let currentSingleAnchorRect = null;

    const TAB_TITLES = {
        query: 'DOI Query',
        export: 'WOS Data Export',
        journal: 'Journal Query',
        builder: 'WOS Query'
    };

    const getSinglePanelLayoutKey = (tabName, field) => `${SINGLE_PANEL_LAYOUT_PREFIX}-${tabName}-${field}`;

    const getSinglePanelLayout = (tabName) => {
        const defaults = SINGLE_PANEL_DEFAULTS[tabName] || SINGLE_PANEL_DEFAULTS.query;
        return {
            width: Math.max(180, parseInt(readStorage(getSinglePanelLayoutKey(tabName, 'width'), String(defaults.width)), 10) || defaults.width),
            height: Math.max(120, parseInt(readStorage(getSinglePanelLayoutKey(tabName, 'height'), String(defaults.height)), 10) || defaults.height)
        };
    };

    const saveSinglePanelLayout = (tabName, width, height) => {
        writeStorage(getSinglePanelLayoutKey(tabName, 'width'), String(Math.round(width)));
        writeStorage(getSinglePanelLayoutKey(tabName, 'height'), String(Math.round(height)));
    };

    const resetSinglePanelLayout = (tabName) => {
        const defaults = SINGLE_PANEL_DEFAULTS[tabName] || SINGLE_PANEL_DEFAULTS.query;
        saveSinglePanelLayout(tabName, defaults.width, defaults.height);
        expandedHeightPx = defaults.height;
        box.style.width = `${defaults.width}px`;
        box.style.height = `${defaults.height}px`;
        box.style.minHeight = `0px`;
        applySinglePanelPlacement();
        ensurePanelInView();
    };

    const applySinglePanelPlacement = () => {
        const { width, height } = getSinglePanelLayout(currentActiveTab);
        expandedHeightPx = height;
        box.style.width = `${width}px`;
        box.style.minWidth = `0px`;
        box.style.height = `${height}px`;
        box.style.minHeight = `0px`;
        const margin = 16;
        const fallbackTop = Math.max(24, Math.round(window.innerHeight * 0.18));
        const hasAnchor = Boolean(currentSingleAnchorRect);
        const anchorTop = currentSingleAnchorRect?.top ?? fallbackTop;
        const anchorLeft = currentSingleAnchorRect?.left ?? Math.round((window.innerWidth - width) / 2);
        const anchorWidth = currentSingleAnchorRect?.width || 38;
        const anchorHeight = currentSingleAnchorRect?.height || 38;
        const nextTop = hasAnchor
            ? Math.round(anchorTop + anchorHeight + margin)
            : fallbackTop;
        const nextLeft = hasAnchor
            ? Math.round(anchorLeft + (anchorWidth / 2) - (width / 2))
            : anchorLeft;
        const clamped = window.clampPanelPosition({
            top: `${nextTop}px`,
            left: `${nextLeft}px`,
            defaultTop: nextTop,
            defaultLeft: nextLeft,
            width,
            height,
            margin: 8
        });
        box.style.top = `${Math.round(clamped.top)}px`;
        box.style.left = `${Math.round(clamped.left)}px`;
    };

    const applyPanelMode = () => {
        const isSinglePanel = currentPanelMode === 'single';
        title.textContent = 'Batch Query';
        controlRow.style.display = isSinglePanel ? 'none' : 'flex';
        singlePanelResetBtn.style.display = isSinglePanel ? 'inline-flex' : 'none';
        singlePanelCloseBtn.style.display = isSinglePanel ? 'inline-flex' : 'none';
        tabRow.style.display = isCollapsed ? 'none' : (isSinglePanel ? 'none' : 'flex');
        copySidBtn.style.display = isSinglePanel ? 'none' : 'inline-flex';
        collapseBtn.style.display = isSinglePanel ? 'none' : 'inline-flex';
        controlRow.style.cursor = isSinglePanel ? 'default' : 'move';
        title.style.cursor = isSinglePanel ? 'default' : 'move';
        box.style.borderRadius = isSinglePanel ? '16px' : '2px';
        box.style.boxShadow = isSinglePanel
            ? '0 10px 28px rgba(15, 23, 42, 0.14)'
            : '0 2px 8px rgba(15, 23, 42, 0.10)';
        tabContentWrap.style.paddingTop = isSinglePanel ? '14px' : '4px';
        if (isSinglePanel) {
            applySinglePanelPlacement();
        } else {
            box.style.width = `${Math.max(260, parseInt(readStorage(WIDTH_KEY, "260px"), 10) || 260)}px`;
            box.style.minWidth = '260px';
            box.style.minHeight = `${Math.max(320, expandedHeightPx)}px`;
        }
        if (resizeHandles.length) {
            resizeHandles.forEach((handle) => {
                handle.style.display = isCollapsed ? 'none' : 'block';
            });
        }
    };

    const autoResizeForJournalTab = () => {
        // Keep journal panel height stable. Query results should scroll inside the panel
        // instead of growing the parent container on each render.
    };

    const applyCollapsedState = () => {
        tabRow.style.display = isCollapsed ? 'none' : 'flex';
        tabContentWrap.style.display = isCollapsed ? 'none' : 'flex';
        box.style.height = `${Math.round(isCollapsed ? COLLAPSED_HEIGHT : expandedHeightPx)}px`;
        box.style.minHeight = `${isCollapsed ? COLLAPSED_HEIGHT : 320}px`;
        controlRow.style.borderRadius = isCollapsed ? '2px' : '2px 2px 0 0';
        collapseBtn.innerHTML = isCollapsed
            ? `<i class="fa-solid fa-chevron-down"></i>`
            : `<i class="fa-solid fa-chevron-up"></i>`;
        collapseBtn.title = isCollapsed ? 'Expand panel' : 'Collapse panel';
        applyPanelMode();
        writeStorage(COLLAPSED_KEY, String(isCollapsed));
        if (!isCollapsed) {
            writeStorage(HEIGHT_KEY, box.style.height);
        }
        if (!isCollapsed && currentPanelMode === 'single') {
            saveSinglePanelLayout(currentActiveTab, box.offsetWidth, expandedHeightPx);
        }
        ensurePanelInView();
    };

    const emitPanelState = () => {
        document.dispatchEvent(new CustomEvent(PANEL_STATE_EVENT, {
            detail: {
                mode: currentPanelMode,
                tab: currentActiveTab,
                visible: box.style.display !== 'none'
            }
        }));
    };

    const isSinglePanelVisible = () => currentPanelMode === 'single' && box.style.display !== 'none';

    const hideSinglePanel = () => {
        if (!isSinglePanelVisible()) {
            return;
        }
        box.style.display = "none";
        writeStorage(VISIBILITY_KEY, "false");
        emitPanelState();
    };

    const queryTabPanel = document.createElement('div');
    queryTabPanel.style.display = 'flex';
    queryTabPanel.style.flexDirection = 'column';
    queryTabPanel.style.minHeight = '100%';
    queryTabPanel.style.gap = '6px';
    queryTabPanel.style.background = '#ffffff';
    queryTabPanel.style.border = 'none';
    queryTabPanel.style.borderRadius = '0';
    queryTabPanel.style.padding = '0';
    queryTabPanel.style.boxSizing = 'border-box';

    const exportTabPanel = document.createElement('div');
    exportTabPanel.style.display = 'none';
    exportTabPanel.style.flexDirection = 'column';
    exportTabPanel.style.minHeight = '100%';
    exportTabPanel.style.gap = '6px';
    exportTabPanel.style.background = '#ffffff';
    exportTabPanel.style.border = 'none';
    exportTabPanel.style.borderRadius = '0';
    exportTabPanel.style.padding = '0';
    exportTabPanel.style.boxSizing = 'border-box';

    const journalTabPanel = document.createElement('div');
    journalTabPanel.style.display = 'none';
    journalTabPanel.style.flexDirection = 'column';
    journalTabPanel.style.minHeight = '100%';
    journalTabPanel.style.gap = '6px';
    journalTabPanel.style.background = '#ffffff';
    journalTabPanel.style.border = 'none';
    journalTabPanel.style.borderRadius = '0';
    journalTabPanel.style.padding = '0';
    journalTabPanel.style.boxSizing = 'border-box';

    const builderTabPanel = document.createElement('div');
    builderTabPanel.style.display = 'none';
    builderTabPanel.style.flexDirection = 'column';
    builderTabPanel.style.flex = '1';
    builderTabPanel.style.minHeight = '100%';
    builderTabPanel.style.gap = '6px';
    builderTabPanel.style.background = '#ffffff';
    builderTabPanel.style.border = 'none';
    builderTabPanel.style.borderRadius = '0';
    builderTabPanel.style.padding = '0';
    builderTabPanel.style.boxSizing = 'border-box';

    tabContentWrap.appendChild(queryTabPanel);
    tabContentWrap.appendChild(exportTabPanel);
    tabContentWrap.appendChild(journalTabPanel);
    tabContentWrap.appendChild(builderTabPanel);
    box.appendChild(tabContentWrap);

    const setActiveTab = (tabName) => {
        currentActiveTab = tabName;
        const isQuery = tabName === 'query';
        const isExport = tabName === 'export';
        const isJournal = tabName === 'journal';
        const isBuilder = tabName === 'builder';

        queryTabPanel.style.display = isQuery ? 'flex' : 'none';
        exportTabPanel.style.display = isExport ? 'flex' : 'none';
        journalTabPanel.style.display = isJournal ? 'flex' : 'none';
        builderTabPanel.style.display = isBuilder ? 'flex' : 'none';

        queryTabBtn.style.background = isQuery ? '#174b78' : '#ffffff';
        queryTabBtn.style.color = isQuery ? '#ffffff' : '#1f5a92';
        queryTabBtn.style.borderColor = isQuery ? '#123a5c' : '#c8d5e2';

        exportTabBtn.style.background = isExport ? '#174b78' : '#ffffff';
        exportTabBtn.style.color = isExport ? '#ffffff' : '#1f5a92';
        exportTabBtn.style.borderColor = isExport ? '#123a5c' : '#c8d5e2';

        journalTabBtn.style.background = isJournal ? '#174b78' : '#ffffff';
        journalTabBtn.style.color = isJournal ? '#ffffff' : '#1f5a92';
        journalTabBtn.style.borderColor = isJournal ? '#123a5c' : '#c8d5e2';

        builderTabBtn.style.background = isBuilder ? '#174b78' : '#ffffff';
        builderTabBtn.style.color = isBuilder ? '#ffffff' : '#1f5a92';
        builderTabBtn.style.borderColor = isBuilder ? '#123a5c' : '#c8d5e2';

        applyPanelMode();

        if (isExport && typeof refreshExportUuidInfo === 'function') {
            refreshExportUuidInfo();
        }
    };

    queryTabBtn.onclick = () => setActiveTab('query');
    exportTabBtn.onclick = () => setActiveTab('export');
    journalTabBtn.onclick = () => setActiveTab('journal');
    builderTabBtn.onclick = () => setActiveTab('builder');
    setActiveTab('query');

    const applyJournalAccess = ({ enabled = false, verified = false } = {}) => {
        const isAllowed = Boolean(enabled);
        journalTabBtn.dataset.verified = String(Boolean(verified));
        journalTabBtn.style.display = isAllowed ? 'block' : 'none';
        if (!isAllowed && journalTabPanel.style.display !== 'none') {
            setActiveTab('query');
        }
    };

    const applyWosQueryAccess = ({ enabled = false, verified = false } = {}) => {
        const isAllowed = Boolean(enabled);
        builderTabBtn.dataset.verified = String(Boolean(verified));
        builderTabBtn.style.display = isAllowed ? 'block' : 'none';
        if (!isAllowed && builderTabPanel.style.display !== 'none') {
            setActiveTab('query');
        }
    };

    const refreshWosQueryAccess = async () => {
        const provider = (await requestStorage("get", WOS_QUERY_PROVIDER_STORAGE_KEY)) || 'openai';
        const enabledValue = await requestStorage("get", WOS_QUERY_ENABLED_KEY);
        const verifiedKey = provider === 'lmstudio' ? WOS_QUERY_LMSTUDIO_VERIFIED_KEY : WOS_QUERY_OPENAI_VERIFIED_KEY;
        const verifiedValue = await requestStorage("get", verifiedKey);
        applyWosQueryAccess({
            enabled: enabledValue === true || enabledValue === "true",
            verified: verifiedValue === true || verifiedValue === "true"
        });
    };

    const mountEasyScholarPanel = () => {
        if (journalTabPanel.dataset.easyscholarMounted === 'true') {
            return true;
        }
        const easyScholarPanel = document.getElementById('wos_easyscholar_panel');
        if (!easyScholarPanel || easyScholarPanel.dataset.embeddedInBatchQuery === 'true') {
            return false;
        }

        const content = easyScholarPanel.children[1];
        if (!content) {
            return false;
        }

        easyScholarPanel.dataset.embeddedInBatchQuery = 'true';
        easyScholarPanel.style.display = 'none';
        easyScholarPanel.style.pointerEvents = 'none';
        content.style.padding = '0';
        content.style.gap = '6px';
        content.style.minHeight = '0';
        content.style.height = 'auto';
        content.style.boxSizing = 'border-box';
        journalTabPanel.appendChild(content);
        journalTabPanel.dataset.easyscholarMounted = 'true';
        return true;
    };

    const ensureEasyScholarMounted = (attemptsLeft = 10) => {
        if (mountEasyScholarPanel() || attemptsLeft <= 0) {
            return;
        }
        setTimeout(() => ensureEasyScholarMounted(attemptsLeft - 1), 120);
    };

    document.addEventListener('__WOS_DOI_QUERY_SWITCH_TAB__', (event) => {
        const tabName = event?.detail?.tab;
        if (!tabName) {
            return;
        }
        if (tabName === 'journal') {
            if (journalTabBtn.style.display === 'none') {
                setActiveTab('query');
                return;
            }
            ensureEasyScholarMounted();
        }
        if (tabName === 'builder' && builderTabBtn.style.display === 'none') {
            setActiveTab('query');
            return;
        }
        setActiveTab(tabName);
    });

    document.addEventListener(PANEL_MODE_EVENT, (event) => {
        currentPanelMode = event?.detail?.mode === 'single' ? 'single' : 'batch';
        currentSingleAnchorRect = event?.detail?.anchorRect || currentSingleAnchorRect;
        if (event?.detail?.tab) {
            currentActiveTab = event.detail.tab;
        }
        applyPanelMode();
        if (currentPanelMode === 'single' && currentActiveTab === 'journal') {
            const savedLayout = getSinglePanelLayout(currentActiveTab);
            expandedHeightPx = savedLayout.height;
            box.style.width = `${savedLayout.width}px`;
            box.style.height = `${savedLayout.height}px`;
            box.style.minHeight = `0px`;
            ensurePanelInView();
        } else if (currentPanelMode === 'single') {
            requestAnimationFrame(() => {
                const savedLayout = getSinglePanelLayout(currentActiveTab);
                expandedHeightPx = savedLayout.height;
                box.style.width = `${savedLayout.width}px`;
                box.style.height = `${savedLayout.height}px`;
                box.style.minHeight = `0px`;
                ensurePanelInView();
            });
        }
    });

    document.addEventListener(PANEL_STATE_EVENT, (event) => {
        if (event?.detail?.requestState) {
            document.dispatchEvent(new CustomEvent(PANEL_STATE_EVENT, {
                detail: {
                    mode: currentPanelMode,
                    tab: currentActiveTab,
                    visible: box.style.display !== 'none'
                }
            }));
        }
    });

    Promise.all([
        requestStorage("get", EASYSCHOLAR_ENABLED_KEY),
        requestStorage("get", EASYSCHOLAR_VERIFIED_KEY)
    ]).then(([enabled, verified]) => {
        applyJournalAccess({
            enabled: enabled === true || enabled === "true",
            verified: verified === true || verified === "true"
        });
    });
    refreshWosQueryAccess();

    document.addEventListener(EASYSCHOLAR_SYNC_EVENT, (event) => {
        applyJournalAccess({
            enabled: Boolean(event?.detail?.enabled),
            verified: Boolean(event?.detail?.verified)
        });
    });

    document.addEventListener(WOS_QUERY_ACCESS_SYNC_EVENT, (event) => {
        applyWosQueryAccess({
            enabled: Boolean(event?.detail?.enabled),
            verified: Boolean(event?.detail?.verified)
        });
    });

    document.addEventListener(JOURNAL_LAYOUT_SYNC_EVENT, (event) => {
        autoResizeForJournalTab(Number(event?.detail?.contentHeight) || 0);
    });

    ensureEasyScholarMounted();

    const topResizeHandle = document.createElement("div");
    topResizeHandle.style.position = "absolute";
    topResizeHandle.style.top = "-3px";
    topResizeHandle.style.left = "0";
    topResizeHandle.style.width = "100%";
    topResizeHandle.style.height = "8px";
    topResizeHandle.style.cursor = "ns-resize";
    topResizeHandle.style.background = "transparent";
    topResizeHandle.style.userSelect = "none";
    topResizeHandle.style.zIndex = "3";

    const rightResizeHandle = document.createElement("div");
    rightResizeHandle.style.position = "absolute";
    rightResizeHandle.style.top = "0";
    rightResizeHandle.style.right = "-3px";
    rightResizeHandle.style.width = "8px";
    rightResizeHandle.style.height = "100%";
    rightResizeHandle.style.cursor = "ew-resize";
    rightResizeHandle.style.background = "transparent";
    rightResizeHandle.style.userSelect = "none";
    rightResizeHandle.style.zIndex = "3";

    const bottomResizeHandle = document.createElement("div");
    bottomResizeHandle.style.position = "absolute";
    bottomResizeHandle.style.bottom = "-3px";
    bottomResizeHandle.style.left = "0";
    bottomResizeHandle.style.width = "100%";
    bottomResizeHandle.style.height = "8px";
    bottomResizeHandle.style.cursor = "ns-resize";
    bottomResizeHandle.style.background = "transparent";
    bottomResizeHandle.style.userSelect = "none";
    bottomResizeHandle.style.zIndex = "3";

    resizeHandles = [topResizeHandle, rightResizeHandle, bottomResizeHandle];
    applyCollapsedState();

    // 内容容器
    const contentBox = document.createElement("div");
    contentBox.style.display = "flex";
    contentBox.style.flexDirection = "column";
    contentBox.style.flex = "1";
    contentBox.style.minHeight = "0";
    contentBox.style.gap = "6px";
    contentBox.style.padding = "0";

    const queryComposer = document.createElement("div");
    queryComposer.style.display = "flex";
    queryComposer.style.flexDirection = "column";
    queryComposer.style.flex = "1";
    queryComposer.style.minHeight = "0";
    queryComposer.style.gap = "8px";
    queryComposer.style.padding = "10px";
    queryComposer.style.border = "1px solid #d7dfe8";
    queryComposer.style.borderRadius = "14px";
    queryComposer.style.background = "#ffffff";
    queryComposer.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.04)";

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Enter WOS IDs or DOIs here...\nOne per line\nHistory supported (↑/↓ or ctrl(control) + ↑/↓ to navigate)";
    textarea.style.width = "100%";
    textarea.style.flex = "1";
    textarea.style.minHeight = "0";
    textarea.style.border = "none";
    textarea.style.padding = "0";
    textarea.style.borderRadius = "0";
    textarea.style.outline = "none";
    textarea.style.fontSize = "11px";
    textarea.style.resize = "none";
    textarea.style.fontFamily = "Consolas, 'Courier New', monospace";
    textarea.style.boxSizing = "border-box";
    textarea.style.background = "#ffffff";

    // 自动提取开关状态
    const AUTO_EXTRACT_KEY = "clipboard-reader-auto-extract";
    let autoExtractEnabled = readStorage(AUTO_EXTRACT_KEY, "false") === "true";

    // 添加键盘事件监听
    textarea.addEventListener("keydown", (e) => {
        if (
            e.key === "ArrowUp" &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            textarea.selectionStart === textarea.selectionEnd &&
            isCaretOnFirstLine(textarea)
        ) {
            e.preventDefault();
            navigateHistory(-1);
        } else if (
            e.key === "ArrowDown" &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            textarea.selectionStart === textarea.selectionEnd &&
            isCaretOnLastLine(textarea)
        ) {
            e.preventDefault();
            navigateHistory(1);
        } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp") {
            e.preventDefault();
            navigateHistory(-1);
        } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") {
            e.preventDefault();
            navigateHistory(1);
        }
    });

    // 提取函数：从文本中提取 WOS ID 和 DOI
    function extractFromText(text) {
        const wosids = [];
        const dois = [];

        // 提取 WOS ID：冒号左侧连续字母，右侧连续数字字母的组合
        // 例如：WOS:000123456789012, MEDLINE:12345678901234, etc.
        const wosidPattern = /\b([WOSwos]+):([A-Z0-9]{10,})\b/gi;
        const wosMatches = [];
        let remainingText = text;
        let match;

        // 先提取所有 WOS ID，并从文本中移除，防止被误识别为 DOI
        while ((match = wosidPattern.exec(text)) !== null) {
            const fullMatch = match[0];
            const normalized = fullMatch.toUpperCase();
            wosids.push(normalized);
            wosMatches.push(fullMatch);
        }

        // 从原文本中移除已匹配的 WOS ID
        wosMatches.forEach(wosid => {
            remainingText = remainingText.replace(wosid, '');
        });

        // 在剩余文本中提取 DOI
        const doiRegex = /\b(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*|urn:doi:\s*|urn:\s*doi:\s*)?(10\.\d{4,9}\/[^\s"'<>()\[\],;]+)/gi;
        while ((match = doiRegex.exec(remainingText)) !== null) {
            let doi = match[1] || match[0];
            doi = doi.replace(/[\.,;:\)\]\}]+$/g, '');
            try { doi = decodeURIComponent(doi); } catch (e) { }
            doi = doi.trim().toLowerCase();
            if (doi) dois.push(doi);
        }

        return { wosids, dois };
    };

    // 添加粘贴事件监听，自动提取、去重和排序
    textarea.addEventListener("paste", (e) => {
        // 如果自动提取未开启，使用默认粘贴行为
        if (!autoExtractEnabled) {
            return;
        }

        e.preventDefault();

        // 获取粘贴的文本
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');



        // 1. 从原有文本中提取
        const currentContent = textarea.value.trim();
        const currentExtracted = extractFromText(currentContent);

        // 2. 从粘贴的文本中提取
        const pastedExtracted = extractFromText(pastedText);

        // 3. 合并
        const allWosids = [...currentExtracted.wosids, ...pastedExtracted.wosids];
        const allDois = [...currentExtracted.dois, ...pastedExtracted.dois];

        // 4. 去重
        const uniqueWosids = [...new Set(allWosids)];
        const uniqueDois = [...new Set(allDois)];

        // 5. 排序后显示：WOS ID 在上，DOI 在下
        const finalContent = [...uniqueWosids, ...uniqueDois].join('\n');
        textarea.value = finalContent;

    });

    queryComposer.appendChild(textarea);

    // 按钮行
    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.alignItems = "center";
    buttonRow.style.justifyContent = "space-between";
    buttonRow.style.gap = "8px";

    const rightActions = document.createElement("div");
    rightActions.style.display = "flex";
    rightActions.style.alignItems = "center";
    rightActions.style.gap = "4px";

    // Query 按钮
    const queryBtn = document.createElement("button");
    queryBtn.textContent = "Search";
    queryBtn.style.padding = "3px 8px";
    queryBtn.style.height = "32px";
    queryBtn.style.background = "#174b78";
    queryBtn.style.color = "#fff";
    queryBtn.style.border = "1px solid #123a5c";
    queryBtn.style.borderRadius = "8px";
    queryBtn.style.cursor = "pointer";
    queryBtn.style.fontSize = "11px";
    queryBtn.style.fontWeight = "600";
    queryBtn.style.outline = "none";
    queryBtn.title = "Query WOS IDs or DOIs from textarea";

    queryBtn.onclick = async () => {
        const text = textarea.value.trim();
        if (!text) {
            console.warn("Please enter WOS IDs or DOIs");
            return;
        }

        // 保存到历史记录
        saveHistory(text);

        const res = extractFromText(text);
        await wos.query_wosid_or_doi(res.wosids, res.dois);
        hideSinglePanel();
    };

    // 创建自动提取切换按钮
    const autoExtractBtn = document.createElement("button");
    autoExtractBtn.textContent = autoExtractEnabled ? "Auto: ON" : "Auto: OFF";
    autoExtractBtn.style.padding = "3px 8px";
    autoExtractBtn.style.height = "32px";
    autoExtractBtn.style.background = autoExtractEnabled ? "#edf4fa" : "#f7f9fb";
    autoExtractBtn.style.color = autoExtractEnabled ? "#174b78" : "#486581";
    autoExtractBtn.style.border = autoExtractEnabled ? "1px solid #9eb6cb" : "1px solid #d0d9e3";
    autoExtractBtn.style.borderRadius = "8px";
    autoExtractBtn.style.cursor = "pointer";
    autoExtractBtn.style.fontSize = "11px";
    autoExtractBtn.style.fontWeight = "600";
    autoExtractBtn.style.outline = "none";
    autoExtractBtn.style.whiteSpace = "nowrap";
    autoExtractBtn.title = "Toggle auto-extract WOS IDs and DOIs on paste";

    autoExtractBtn.onclick = () => {
        autoExtractEnabled = !autoExtractEnabled;
        writeStorage(AUTO_EXTRACT_KEY, autoExtractEnabled.toString());

        autoExtractBtn.textContent = autoExtractEnabled ? "Auto: ON" : "Auto: OFF";
        autoExtractBtn.style.background = autoExtractEnabled ? "#edf4fa" : "#f7f9fb";
        autoExtractBtn.style.color = autoExtractEnabled ? "#174b78" : "#486581";
        autoExtractBtn.style.border = autoExtractEnabled ? "1px solid #9eb6cb" : "1px solid #d0d9e3";

    };

    buttonRow.appendChild(autoExtractBtn);

    queryComposer.appendChild(buttonRow);
    contentBox.appendChild(queryComposer);
    queryTabPanel.appendChild(contentBox);

    // === 底部添加 DOI/WOS Data Export 按钮 ===
    const exportFlowGroup = document.createElement('div');
    exportFlowGroup.style.display = 'flex';
    exportFlowGroup.style.flexDirection = 'column';
    exportFlowGroup.style.gap = '6px';
    exportFlowGroup.style.marginTop = '0';
    exportFlowGroup.style.padding = '0';
    exportFlowGroup.style.background = 'transparent';
    exportFlowGroup.style.border = 'none';
    exportFlowGroup.style.borderRadius = '0';

    const exportFlowTitle = document.createElement('div');
    exportFlowTitle.textContent = 'Export Flow';
    exportFlowTitle.style.color = '#274c6b';
    exportFlowTitle.style.fontSize = '11px';
    exportFlowTitle.style.fontWeight = '600';

    const exportFlowHint = document.createElement('div');
    exportFlowHint.textContent = 'Step 1: Select directory -> Step 2: Export';
    exportFlowHint.style.color = '#6b7c93';
    exportFlowHint.style.fontSize = '10px';
    exportFlowHint.style.lineHeight = '1.4';
    exportFlowHint.style.marginBottom = '0';

    exportFlowGroup.appendChild(exportFlowTitle);
    exportFlowGroup.appendChild(exportFlowHint);

    const exportUuidInfoRow = document.createElement('div');
    exportUuidInfoRow.style.display = 'flex';
    exportUuidInfoRow.style.alignItems = 'center';
    exportUuidInfoRow.style.gap = '6px';

    const exportUuidInfo = document.createElement('div');
    exportUuidInfo.style.flex = '1';
    exportUuidInfo.style.padding = '0';
    exportUuidInfo.style.background = 'transparent';
    exportUuidInfo.style.border = 'none';
    exportUuidInfo.style.borderRadius = '0';
    exportUuidInfo.style.color = '#243b53';
    exportUuidInfo.style.fontSize = '10px';
    exportUuidInfo.style.lineHeight = '1.4';
    exportUuidInfo.textContent = 'Current UUID: Loading...';

    const exportUuidRefreshBtn = document.createElement('button');
    exportUuidRefreshBtn.type = 'button';
    exportUuidRefreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
    exportUuidRefreshBtn.style.width = '24px';
    exportUuidRefreshBtn.style.height = '24px';
    exportUuidRefreshBtn.style.flexShrink = '0';
    exportUuidRefreshBtn.style.display = 'inline-flex';
    exportUuidRefreshBtn.style.alignItems = 'center';
    exportUuidRefreshBtn.style.justifyContent = 'center';
    exportUuidRefreshBtn.style.padding = '0';
    exportUuidRefreshBtn.style.border = '1px solid #d0d9e3';
    exportUuidRefreshBtn.style.borderRadius = '999px';
    exportUuidRefreshBtn.style.background = '#f7f9fb';
    exportUuidRefreshBtn.style.color = '#486581';
    exportUuidRefreshBtn.style.cursor = 'pointer';
    exportUuidRefreshBtn.style.boxShadow = 'none';
    exportUuidRefreshBtn.title = 'Refresh current page UUID';

    exportUuidInfoRow.appendChild(exportUuidInfo);
    exportUuidInfoRow.appendChild(exportUuidRefreshBtn);
    exportFlowGroup.appendChild(exportUuidInfoRow);

    const exportUuidJumpWrap = document.createElement('div');
    exportUuidJumpWrap.style.display = 'none';
    exportUuidJumpWrap.style.flexDirection = 'column';
    exportUuidJumpWrap.style.gap = '6px';
    exportUuidJumpWrap.style.padding = '6px 0 0';

    const exportUuidJumpHint = document.createElement('div');
    exportUuidJumpHint.textContent = 'Current page has no UUID. Enter a UUID to open its result page first.';
    exportUuidJumpHint.style.color = '#6b7c93';
    exportUuidJumpHint.style.fontSize = '10px';
    exportUuidJumpHint.style.lineHeight = '1.4';

    const exportUuidInput = document.createElement('input');
    exportUuidInput.type = 'text';
    exportUuidInput.placeholder = 'Enter UUID';
    exportUuidInput.style.flex = '1';
    exportUuidInput.style.height = '24px';
    exportUuidInput.style.padding = '4px 8px';
    exportUuidInput.style.boxSizing = 'border-box';
    exportUuidInput.style.border = '1px solid #d0d9e3';
    exportUuidInput.style.borderRadius = '2px';
    exportUuidInput.style.fontSize = '11px';
    exportUuidInput.style.fontFamily = "Consolas, 'Courier New', monospace";
    exportUuidInput.style.outline = 'none';

    const EXPORT_UUID_AUTO_EXTRACT_KEY = 'export-uuid-auto-extract';
    let exportUuidAutoExtractEnabled = readStorage(EXPORT_UUID_AUTO_EXTRACT_KEY, "true") === "true";

    const exportUuidInputRow = document.createElement('div');
    exportUuidInputRow.style.display = 'flex';
    exportUuidInputRow.style.alignItems = 'center';
    exportUuidInputRow.style.gap = '8px';

    const exportUuidAutoExtractBtn = document.createElement('button');
    exportUuidAutoExtractBtn.style.padding = '3px 8px';
    exportUuidAutoExtractBtn.style.height = '24px';
    exportUuidAutoExtractBtn.style.flexShrink = '0';
    exportUuidAutoExtractBtn.style.borderRadius = '8px';
    exportUuidAutoExtractBtn.style.cursor = 'pointer';
    exportUuidAutoExtractBtn.style.fontSize = '11px';
    exportUuidAutoExtractBtn.style.fontWeight = '600';
    exportUuidAutoExtractBtn.style.outline = 'none';
    exportUuidAutoExtractBtn.style.whiteSpace = 'nowrap';
    exportUuidAutoExtractBtn.title = 'Toggle auto-extract UUID from pasted text';

    const syncExportUuidAutoExtractBtn = () => {
        exportUuidAutoExtractBtn.textContent = exportUuidAutoExtractEnabled ? 'Auto: ON' : 'Auto: OFF';
        exportUuidAutoExtractBtn.style.background = exportUuidAutoExtractEnabled ? '#edf4fa' : '#f7f9fb';
        exportUuidAutoExtractBtn.style.color = exportUuidAutoExtractEnabled ? '#174b78' : '#486581';
        exportUuidAutoExtractBtn.style.border = exportUuidAutoExtractEnabled ? '1px solid #9eb6cb' : '1px solid #d0d9e3';
    };
    syncExportUuidAutoExtractBtn();

    const applyExportUuidAutoExtract = () => {
        const currentValue = String(exportUuidInput.value || '').trim();
        exportUuidInput.value = extractUuidFromText(currentValue) || '';
    };

    exportUuidAutoExtractBtn.onclick = () => {
        exportUuidAutoExtractEnabled = !exportUuidAutoExtractEnabled;
        writeStorage(EXPORT_UUID_AUTO_EXTRACT_KEY, exportUuidAutoExtractEnabled.toString());
        syncExportUuidAutoExtractBtn();
        if (exportUuidAutoExtractEnabled) {
            applyExportUuidAutoExtract();
        }
    };

    exportUuidInputRow.appendChild(exportUuidInput);
    exportUuidInputRow.appendChild(exportUuidAutoExtractBtn);

    const openUuidPageBtn = document.createElement('button');
    openUuidPageBtn.textContent = 'Open UUID Page';
    openUuidPageBtn.style.display = 'block';
    openUuidPageBtn.style.width = '100%';
    openUuidPageBtn.style.padding = '4px 8px';
    openUuidPageBtn.style.height = '24px';
    openUuidPageBtn.style.background = '#174b78';
    openUuidPageBtn.style.color = '#fff';
    openUuidPageBtn.style.border = '1px solid #123a5c';
    openUuidPageBtn.style.borderRadius = '2px';
    openUuidPageBtn.style.fontSize = '11px';
    openUuidPageBtn.style.cursor = 'pointer';
    openUuidPageBtn.style.boxShadow = 'none';

    exportUuidJumpWrap.appendChild(exportUuidJumpHint);
    exportUuidJumpWrap.appendChild(exportUuidInputRow);
    exportUuidJumpWrap.appendChild(openUuidPageBtn);
    exportFlowGroup.appendChild(exportUuidJumpWrap);

    let currentExportUuid = '';
    const syncExportUuidMode = (uuid = '') => {
        currentExportUuid = String(uuid || '').trim();
        const hasUuid = Boolean(currentExportUuid);
        selectExportDirBtn.style.display = hasUuid ? 'block' : 'none';
        exportFormatRow.style.display = hasUuid ? 'flex' : 'none';
        exportBtn.style.display = hasUuid ? 'block' : 'none';
        exportUuidJumpWrap.style.display = hasUuid ? 'none' : 'flex';
        exportFlowHint.style.display = hasUuid ? 'block' : 'none';
        if (!hasUuid) {
            exportProgressWrap.style.display = 'none';
        }
    };

    const UUID_URL_PATTERN = /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/;

    const extractUuidFromCurrentUrl = () => {
        const href = String(window.location.href || '');
        const match = href.match(UUID_URL_PATTERN);
        return match ? match[0] : '';
    };

    const isValidUuid = (value = '') => UUID_URL_PATTERN.test(String(value || '').trim());

    const extractUuidFromText = (value = '') => {
        const text = String(value || '').trim();
        const match = text.match(UUID_URL_PATTERN);
        return match ? match[0] : '';
    };

    const refreshExportUuidInfo = ({ syncInput = true } = {}) => {
        const uuid = extractUuidFromCurrentUrl();

        if (!uuid) {
            exportUuidInfo.textContent = 'Current URL: No UUID detected';
            exportUuidInfo.style.color = '#7b8794';
            syncExportUuidMode('');
            return '';
        }

        exportUuidInfo.textContent = `Current UUID: ${uuid}`;
        exportUuidInfo.style.color = '#243b53';
        if (syncInput) {
            exportUuidInput.value = uuid;
        }
        syncExportUuidMode(uuid);
        return uuid;
    };

    exportUuidRefreshBtn.onclick = () => {
        refreshExportUuidInfo({ syncInput: true });
    };

    const selectExportDirBtn = document.createElement('button');
    selectExportDirBtn.textContent = 'Step 1: Select Export Directory';
    selectExportDirBtn.style.display = 'block';
    selectExportDirBtn.style.width = '100%';
    selectExportDirBtn.style.padding = '4px 8px';
    selectExportDirBtn.style.height = '24px';
    selectExportDirBtn.style.background = '#f7f9fb';
    selectExportDirBtn.style.color = '#486581';
    selectExportDirBtn.style.border = '1px solid #d0d9e3';
    selectExportDirBtn.style.borderRadius = '2px';
    selectExportDirBtn.style.fontSize = '11px';
    selectExportDirBtn.style.cursor = 'pointer';
    selectExportDirBtn.style.boxShadow = 'none';

    const setButtonIconAndText = (button, iconClass, text) => {
        button.replaceChildren();
        const icon = document.createElement('i');
        icon.className = iconClass;
        icon.style.marginRight = '6px';
        button.appendChild(icon);
        button.appendChild(document.createTextNode(text));
    };

    const exportFormatRow = document.createElement('div');
    exportFormatRow.style.display = 'flex';
    exportFormatRow.style.gap = '6px';
    exportFormatRow.style.alignItems = 'center';

    const exportFormatLabel = document.createElement('div');
    exportFormatLabel.textContent = 'Step 2 Format';
    exportFormatLabel.style.color = '#486581';
    exportFormatLabel.style.whiteSpace = 'nowrap';

    const exportFormatSelect = document.createElement('select');
    exportFormatSelect.style.flex = '1';
    exportFormatSelect.style.height = '30px';
    exportFormatSelect.style.padding = '0 10px';
    exportFormatSelect.style.border = '1px solid #d0d9e3';
    exportFormatSelect.style.borderRadius = '8px';
    exportFormatSelect.style.background = '#fff';
    exportFormatSelect.innerHTML = `
        <option value="txt">TXT</option>
        <option value="bib">BIB</option>
    `;

    exportFormatRow.appendChild(exportFormatLabel);
    exportFormatRow.appendChild(exportFormatSelect);

    const exportBtn = document.createElement('button');
    const getExportBtnDefaultText = () => `Step 2: Export all (500 per ${exportFormatSelect.value} file)`;
    exportBtn.textContent = getExportBtnDefaultText();
    exportBtn.style.display = 'block';
    exportBtn.style.width = '100%';
    exportBtn.style.padding = '4px 8px';
    exportBtn.style.height = '24px';
    exportBtn.style.background = '#174b78';
    exportBtn.style.color = '#fff';
    exportBtn.style.border = '1px solid #123a5c';
    exportBtn.style.borderRadius = '2px';
    exportBtn.style.fontSize = '11px';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.boxShadow = 'none';
    exportBtn.disabled = true;

    let exportInProgress = false;
    const syncExportFlowState = () => {
        const hasDir = !!exportDirHandle;
        const dirLabel = exportDirName || (hasDir && exportDirHandle && exportDirHandle.name ? exportDirHandle.name : '');
        if (hasDir) {
            setButtonIconAndText(selectExportDirBtn, 'fa-solid fa-circle-check', `Step 1: Directory Selected (${dirLabel})`);
            selectExportDirBtn.style.background = '#edf4fa';
            selectExportDirBtn.style.color = '#174b78';
            selectExportDirBtn.style.border = '1px solid #9eb6cb';
        } else {
            setButtonIconAndText(selectExportDirBtn, 'fa-solid fa-folder-open', 'Step 1: Select Export Directory');
            selectExportDirBtn.style.background = '#f7f9fb';
            selectExportDirBtn.style.color = '#486581';
            selectExportDirBtn.style.border = '1px solid #d0d9e3';
        }

        const canExport = hasDir && !exportInProgress;
        exportBtn.disabled = !canExport;
        exportBtn.style.opacity = canExport ? '1' : '0.6';
        exportBtn.style.cursor = canExport ? 'pointer' : 'not-allowed';
        if (!exportInProgress) {
            exportBtn.textContent = getExportBtnDefaultText();
        }
        exportBtn.title = hasDir ? `Step 2: Export all records as ${exportFormatSelect.value.toUpperCase()} in 500-per-file batches` : 'Select export directory first';
    };

    exportFormatSelect.addEventListener('change', () => {
        syncExportFlowState();
    });

    selectExportDirBtn.onclick = async () => {
        try {
            await chooseExportDirectory();
            syncExportFlowState();
        } catch (error) {
            if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
                return;
            }
            alert('Failed to select directory: ' + (error && error.message ? error.message : error));
        }
    };

    openUuidPageBtn.onclick = async () => {
        const uuid = String(exportUuidInput.value || '').trim();
        if (!uuid) {
            alert('Please enter a UUID first.');
            return;
        }

        if (!isValidUuid(uuid)) {
            alert('Invalid UUID format.');
            return;
        }

        const oldText = openUuidPageBtn.textContent;
        openUuidPageBtn.textContent = 'Opening...';
        openUuidPageBtn.disabled = true;

        try {
            if (window.wos && window.wos.uuid && typeof window.wos.uuid.open === 'function') {
                await window.wos.uuid.open(uuid);
                exportUuidInput.value = uuid;
                refreshExportUuidInfo();
            } else {
                throw new Error('window.wos.uuid.open is unavailable');
            }
        } catch (error) {
            alert(error && error.message ? error.message : 'Failed to open UUID page.');
        } finally {
            openUuidPageBtn.textContent = oldText;
            openUuidPageBtn.disabled = false;
        }
    };

    exportUuidInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            openUuidPageBtn.click();
        }
    });

    exportUuidInput.addEventListener('paste', (event) => {
        if (!exportUuidAutoExtractEnabled) {
            return;
        }
        event.preventDefault();
        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        const rawValue = String(pastedText || '').trim();
        exportUuidInput.value = extractUuidFromText(rawValue) || '';
    });

    // 尝试从 popup 写入的 handle 恢复目录
    loadStoredProjectHandle().then((handle) => {
        if (!handle) return;
        exportDirHandle = handle;
        exportDirName = handle.name || '';
        window.wosAideDirectoryHandle = handle;
        syncExportFlowState();
    });

    const exportProgressWrap = document.createElement('div');
    exportProgressWrap.style.display = 'none';
    exportProgressWrap.style.padding = '4px 0 0';
    exportProgressWrap.style.background = 'transparent';
    exportProgressWrap.style.border = 'none';
    exportProgressWrap.style.borderRadius = '0';

    const exportProgressStepTitle = document.createElement('div');
    exportProgressStepTitle.textContent = 'Progress';
    exportProgressStepTitle.style.color = '#486581';
    exportProgressStepTitle.style.fontSize = '10px';
    exportProgressStepTitle.style.marginBottom = '2px';

    const exportProgressText = document.createElement('div');
    exportProgressText.style.color = '#243b53';
    exportProgressText.style.fontSize = '10px';
    exportProgressText.style.marginBottom = '3px';
    exportProgressText.textContent = 'Waiting...';

    const exportProgressBar = document.createElement('div');
    exportProgressBar.style.width = '100%';
    exportProgressBar.style.height = '6px';
    exportProgressBar.style.background = '#dde4ec';
    exportProgressBar.style.borderRadius = '999px';
    exportProgressBar.style.overflow = 'hidden';

    const exportProgressFill = document.createElement('div');
    exportProgressFill.style.width = '0%';
    exportProgressFill.style.height = '100%';
    exportProgressFill.style.background = '#315f86';
    exportProgressFill.style.transition = 'width 0.2s ease';
    exportProgressBar.appendChild(exportProgressFill);

    const exportProgressDetail = document.createElement('div');
    exportProgressDetail.style.color = '#6b7c93';
    exportProgressDetail.style.fontSize = '10px';
    exportProgressDetail.style.marginTop = '3px';
    exportProgressDetail.textContent = '';

    exportProgressWrap.appendChild(exportProgressStepTitle);
    exportProgressWrap.appendChild(exportProgressText);
    exportProgressWrap.appendChild(exportProgressBar);
    exportProgressWrap.appendChild(exportProgressDetail);

    const renderExportProgress = ({
        visible = true,
        statusText = 'Exporting...',
        detailText = '',
        completed = 0,
        total = 0,
        isError = false,
        hideBar = false
    } = {}) => {
        exportProgressWrap.style.display = visible ? 'block' : 'none';
        exportProgressText.textContent = statusText;
        exportProgressText.style.color = isError ? '#a5483f' : '#243b53';
        exportProgressDetail.textContent = detailText;
        exportProgressBar.style.display = hideBar ? 'none' : 'block';
        const ratio = total > 0 ? Math.max(0, Math.min(completed / total, 1)) : 0;
        exportProgressFill.style.width = `${Math.round(ratio * 100)}%`;
        exportProgressFill.style.background = isError ? '#a5483f' : '#315f86';
    };

    exportBtn.onclick = async () => {
        refreshExportUuidInfo();

        if (!currentExportUuid) {
            renderExportProgress({
                visible: true,
                statusText: 'Please open a UUID page first',
                detailText: 'Enter a UUID above and jump to its result page',
                completed: 0,
                total: 0,
                isError: true
            });
            return;
        }

        if (!exportDirHandle) {
            renderExportProgress({
                visible: true,
                statusText: 'Please select export directory first',
                detailText: 'Step 1 is required before export',
                completed: 0,
                total: 0,
                isError: true
            });
            return;
        }
        exportInProgress = true;
        syncExportFlowState();
        const exportFormat = exportFormatSelect.value === 'bib' ? 'bib' : 'txt';
        const oldText = exportBtn.textContent;
        exportBtn.textContent = 'Step 2: Exporting...';
        let finalCompleted = 0;
        let finalTotal = 0;
        renderExportProgress({
            visible: true,
            statusText: 'Preparing export...',
            detailText: 'Initializing batch export',
            completed: 0,
            total: 0
        });
        try {
            const exportMethodName = exportFormat === 'bib' ? 'export_batchSize_toBib' : 'export_batchSize_toTxt';
            if (window.wos && window.wos.uuid && typeof window.wos.uuid[exportMethodName] === 'function') {
                await window.wos.uuid[exportMethodName](1, 0, 200, (progress = {}) => {
                    const {
                        phase = '',
                        completedBatches = 0,
                        totalBatches = 0,
                        current = 0,
                        batchEnd = 0,
                        message = ''
                    } = progress;
                    finalCompleted = completedBatches;
                    finalTotal = totalBatches;

                    if (phase === 'start') {
                        renderExportProgress({
                            visible: true,
                            statusText: `Exporting... 0/${totalBatches}`,
                            detailText: `Records ${progress.markFrom || 0}-${progress.markTo || 0}`,
                            completed: 0,
                            total: totalBatches
                        });
                        return;
                    }

                    if (phase === 'batch') {
                        renderExportProgress({
                            visible: true,
                            statusText: `Exporting... ${completedBatches}/${totalBatches}`,
                            detailText: `Saved records ${current}-${batchEnd}`,
                            completed: completedBatches,
                            total: totalBatches
                        });
                        return;
                    }

                    if (phase === 'error') {
                        renderExportProgress({
                            visible: true,
                            statusText: 'Export failed',
                            detailText: message || 'Batch export failed',
                            completed: completedBatches,
                            total: totalBatches,
                            isError: true
                        });
                        return;
                    }

                    if (phase === 'complete') {
                        renderExportProgress({
                            visible: true,
                            statusText: `Export completed ${completedBatches}/${totalBatches}`,
                            detailText: 'All batch files are saved',
                            completed: completedBatches,
                            total: totalBatches
                        });
                    }
                });
                exportBtn.textContent = `Step 2: ${exportFormat.toUpperCase()} export completed!`;
                renderExportProgress({
                    visible: true,
                    statusText: `${exportFormat.toUpperCase()} export succeeded`,
                    detailText: `Saved ${finalCompleted}/${finalTotal} batch files`,
                    completed: finalCompleted,
                    total: finalTotal,
                    hideBar: true
                });
            } else {
                exportBtn.textContent = 'Step 2: Export function not found';
                renderExportProgress({
                    visible: true,
                    statusText: 'Export function not found',
                    detailText: `window.wos.uuid.${exportMethodName} is unavailable`,
                    completed: 0,
                    total: 0,
                    isError: true
                });
            }
        } catch (err) {
            exportBtn.textContent = 'Step 2: Export failed';
            renderExportProgress({
                visible: true,
                statusText: 'Export failed',
                detailText: err && err.message ? err.message : 'Unexpected export error',
                completed: finalCompleted,
                total: finalTotal,
                isError: true
            });
        } finally {
            setTimeout(() => {
                exportBtn.textContent = oldText || getExportBtnDefaultText();
                exportInProgress = false;
                syncExportFlowState();
                if (exportProgressText.textContent.toLowerCase().includes('succeeded')) {
                    exportProgressBar.style.display = 'none';
                    exportProgressDetail.textContent = exportProgressDetail.textContent || 'Download completed.';
                    return;
                }
                exportProgressWrap.style.display = 'none';
            }, 2000);
        }
    };

    syncExportFlowState();
    refreshExportUuidInfo();


    // 添加 Async Enlightenkey DOIList 按钮
    const asyncDoiBtn = document.createElement('button');
    // 初始化按钮文本，显示 DOI 数量
    async function updateAsyncDoiBtnText() {
        const doiList = await new Promise(resolve => {
            function handleDoiListMsg(event) {
                if (event.data && event.data.type === 'WOS_AIDE_DOI_LIST_RESPONSE') {
                    window.removeEventListener('message', handleDoiListMsg);
                    resolve(event.data.doiList || []);
                }
            }
            window.addEventListener('message', handleDoiListMsg);
            window.postMessage({ type: 'WOS_AIDE_DOI_LIST_REQUEST' }, '*');
            setTimeout(() => {
                window.removeEventListener('message', handleDoiListMsg);
                resolve([]);
            }, 1500);
        });
        if (!doiList || doiList.length === 0) {
            asyncDoiBtn.style.display = 'none';
            return;
        }
        asyncDoiBtn.style.display = 'block';
        asyncDoiBtn.textContent = `Open WOS Aide DOI List (${doiList.length})`;
    }

    asyncDoiBtn.style.display = 'none';
    asyncDoiBtn.style.width = 'auto';
    asyncDoiBtn.style.padding = '4px 8px';
    asyncDoiBtn.style.height = '32px';
    asyncDoiBtn.style.background = '#ffffff';
    asyncDoiBtn.style.color = '#fff';
    asyncDoiBtn.style.color = '#9a5b12';
    asyncDoiBtn.style.border = '1px solid #e0c39e';
    asyncDoiBtn.style.borderRadius = '8px';
    asyncDoiBtn.style.fontSize = '11px';
    asyncDoiBtn.style.cursor = 'pointer';
    asyncDoiBtn.style.boxShadow = 'none';
    asyncDoiBtn.disabled = false;
    updateAsyncDoiBtnText();

    asyncDoiBtn.onclick = async () => {
        asyncDoiBtn.disabled = true;
        const oldText = asyncDoiBtn.textContent;
        asyncDoiBtn.textContent = 'Fetching...';
        try {
            // 每次点击前刷新数量
            await updateAsyncDoiBtnText();
            // 1. 通过 window.postMessage 请求 contentScript 代为获取 DOI 列表
            const doiList = await new Promise(resolve => {
                function handleDoiListMsg(event) {
                    if (event.data && event.data.type === 'WOS_AIDE_DOI_LIST_RESPONSE') {
                        window.removeEventListener('message', handleDoiListMsg);
                        resolve(event.data.doiList || []);
                    }
                }
                window.addEventListener('message', handleDoiListMsg);
                window.postMessage({ type: 'WOS_AIDE_DOI_LIST_REQUEST' }, '*');
                // 超时兜底
                setTimeout(() => {
                    window.removeEventListener('message', handleDoiListMsg);
                    resolve([]);
                }, 3000);
            });
            if (!doiList || doiList.length === 0) {
                asyncDoiBtn.style.display = 'none';
                asyncDoiBtn.disabled = false;
                return;
            }
            // 2. 执行一次 wos query
            if (window.wos && typeof window.wos.query_wosid_or_doi === 'function') {
                await window.wos.query_wosid_or_doi([], doiList);
            }
            // 3. 输出 DOI 数量
            console.log('[Async WOS Aide DOI List] DOI数量:', doiList.length);

            asyncDoiBtn.textContent = 'Opened WOS Aide DOIs!';
        } catch (err) {
            asyncDoiBtn.textContent = 'failed to open DOIs';
        } finally {
            setTimeout(() => {
                asyncDoiBtn.textContent = oldText;
                asyncDoiBtn.disabled = false;
            }, 2000);
        }
    };

    rightActions.appendChild(asyncDoiBtn);
    rightActions.appendChild(queryBtn);
    buttonRow.appendChild(rightActions);
    exportFlowGroup.appendChild(selectExportDirBtn);
    exportFlowGroup.appendChild(exportFormatRow);
    exportFlowGroup.appendChild(exportBtn);
    exportFlowGroup.appendChild(exportProgressWrap);
    exportTabPanel.appendChild(exportFlowGroup);

    // WOS Query 输入区
    const wosQueryRow = document.createElement('div');
    wosQueryRow.style.display = 'flex';
    wosQueryRow.style.flexDirection = 'column';
    wosQueryRow.style.flex = '1';
    wosQueryRow.style.minHeight = '0';
    wosQueryRow.style.gap = '8px';
    wosQueryRow.style.padding = '10px';
    wosQueryRow.style.border = '1px solid #d7dfe8';
    wosQueryRow.style.borderRadius = '14px';
    wosQueryRow.style.background = '#ffffff';
    wosQueryRow.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';

    // WOS Query 输入框
    const wosQueryInput = document.createElement('textarea');
    wosQueryInput.placeholder = 'Describe the WOS query you want to build...';
    wosQueryInput.rows = 4;
    wosQueryInput.style.width = '100%';
    wosQueryInput.style.flex = '1';
    wosQueryInput.style.minHeight = '0';
    wosQueryInput.style.padding = '0';
    wosQueryInput.style.border = 'none';
    wosQueryInput.style.borderRadius = '0';
    wosQueryInput.style.outline = 'none';
    wosQueryInput.style.resize = 'none';
    wosQueryInput.style.background = '#ffffff';
    wosQueryInput.style.lineHeight = '1.5';
    wosQueryInput.style.boxSizing = 'border-box';

    const wosQueryActions = document.createElement('div');
    wosQueryActions.style.display = 'flex';
    wosQueryActions.style.alignItems = 'center';
    wosQueryActions.style.justifyContent = 'space-between';
    wosQueryActions.style.gap = '8px';

    const wosQueryHint = document.createElement('div');
    wosQueryHint.textContent = 'Enter for newline, Ctrl/Cmd+Enter to send';
    wosQueryHint.style.color = '#6b7c93';
    wosQueryHint.style.lineHeight = '1.4';

    const wosQueryModelHint = document.createElement('div');
    wosQueryModelHint.style.display = 'flex';
    wosQueryModelHint.style.alignItems = 'center';
    wosQueryModelHint.style.gap = '6px';
    wosQueryModelHint.style.padding = '0';
    wosQueryModelHint.style.border = 'none';
    wosQueryModelHint.style.borderRadius = '0';
    wosQueryModelHint.style.background = 'transparent';
    wosQueryModelHint.style.boxShadow = 'none';
    wosQueryModelHint.style.fontSize = '11px';
    wosQueryModelHint.style.lineHeight = '1.3';

    const wosQueryModelIcon = document.createElement('span');
    wosQueryModelIcon.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    wosQueryModelIcon.style.display = 'inline-flex';
    wosQueryModelIcon.style.alignItems = 'center';
    wosQueryModelIcon.style.justifyContent = 'center';
    wosQueryModelIcon.style.width = '16px';
    wosQueryModelIcon.style.height = '16px';
    wosQueryModelIcon.style.color = '#174b78';
    wosQueryModelIcon.style.fontSize = '11px';
    wosQueryModelIcon.style.flexShrink = '0';

    const wosQueryModelText = document.createElement('div');
    wosQueryModelText.style.display = 'flex';
    wosQueryModelText.style.flexWrap = 'nowrap';
    wosQueryModelText.style.alignItems = 'center';
    wosQueryModelText.style.gap = '4px';
    wosQueryModelText.style.minWidth = '0';
    wosQueryModelText.style.color = '#4d657b';

    const wosQueryProviderBadge = document.createElement('span');
    wosQueryProviderBadge.style.display = 'inline-flex';
    wosQueryProviderBadge.style.alignItems = 'center';
    wosQueryProviderBadge.style.padding = '1px 6px';
    wosQueryProviderBadge.style.borderRadius = '999px';
    wosQueryProviderBadge.style.fontSize = '10px';
    wosQueryProviderBadge.style.fontWeight = '700';
    wosQueryProviderBadge.style.letterSpacing = '0.15px';
    wosQueryProviderBadge.style.border = '1px solid transparent';

    const wosQueryModelLabel = document.createElement('span');
    wosQueryModelLabel.textContent = '·';
    wosQueryModelLabel.style.color = '#8aa0b5';
    wosQueryModelLabel.style.fontWeight = '600';

    const wosQueryModelValue = document.createElement('span');
    wosQueryModelValue.style.color = '#163956';
    wosQueryModelValue.style.fontWeight = '700';
    wosQueryModelValue.style.fontSize = '11px';
    wosQueryModelValue.style.whiteSpace = 'nowrap';
    wosQueryModelValue.style.overflow = 'hidden';
    wosQueryModelValue.style.textOverflow = 'ellipsis';
    wosQueryModelValue.style.wordBreak = 'break-word';

    wosQueryModelText.appendChild(wosQueryProviderBadge);
    wosQueryModelText.appendChild(wosQueryModelLabel);
    wosQueryModelText.appendChild(wosQueryModelValue);
    wosQueryModelHint.appendChild(wosQueryModelIcon);
    wosQueryModelHint.appendChild(wosQueryModelText);

    // WOS Query 提交按钮
    const wosQueryBtn = document.createElement('button');
    wosQueryBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    wosQueryBtn.style.width = '40px';
    wosQueryBtn.style.height = '40px';
    wosQueryBtn.style.background = '#174b78';
    wosQueryBtn.style.color = '#fff';
    wosQueryBtn.style.border = '1px solid #123a5c';
    wosQueryBtn.style.borderRadius = '999px';
    wosQueryBtn.style.cursor = 'pointer';
    wosQueryBtn.style.outline = 'none';
    wosQueryBtn.style.whiteSpace = 'nowrap';
    wosQueryBtn.style.display = 'flex';
    wosQueryBtn.style.alignItems = 'center';
    wosQueryBtn.style.justifyContent = 'center';
    wosQueryBtn.title = 'Build and execute WOS query';

    const PROMPT_CACHE = new Map();

    const resolveExtensionBaseUrl = () => {
        if (globalThis.__WOS_AIDE_EXTENSION_BASE_URL__) {
            return globalThis.__WOS_AIDE_EXTENSION_BASE_URL__;
        }
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                return chrome.runtime.getURL('');
            }
        } catch (e) {}
        const scriptUrl = (document.currentScript && document.currentScript.src) || '';
        if (scriptUrl) {
            return new URL('.', scriptUrl).toString();
        }
        const fallback = Array.from(document.scripts || []).find(
            (script) => script.src && script.src.includes('z-wos-doi-query.js')
        );
        if (fallback?.src) {
            return new URL('.', fallback.src).toString();
        }
        return '';
    };

    const EXTENSION_BASE_URL = resolveExtensionBaseUrl();
    const getPromptUrl = (relativePath) => {
        if (EXTENSION_BASE_URL) {
            return new URL(relativePath, EXTENSION_BASE_URL).toString();
        }
        return relativePath;
    };

    const loadPrompt = async () => {
        if (PROMPT_CACHE.has('wosQuery')) {
            return PROMPT_CACHE.get('wosQuery');
        }
        const url = getPromptUrl('prompts/wos-query.md');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load prompt: wosQuery (${response.status})`);
        }
        const text = (await response.text()).trim();
        PROMPT_CACHE.set('wosQuery', text);
        return text;
    };

    const buildStrictWosQueryPrompt = (basePrompt) => `${basePrompt}

Additional output rules:
1. Return JSON only. Do not return markdown, code fences, or explanation text.
2. The JSON shape must be {"wos_query":[{"rowText":"..."}]}.
3. If rowText contains an OG=(...) segment, replace the standalone word "and" inside the parentheses with "&".
4. Do not change "and" outside OG=(...).`;

    const normalizeOgAndOperators = (rowText) => String(rowText || '').replace(/OG=\(([^)]*)\)/gi, (_match, inner) => {
        const normalizedInner = inner
            .replace(/\band\b/gi, '&')
            .replace(/\s*&\s*/g, ' & ')
            .replace(/\s{2,}/g, ' ')
            .trim();
        return `OG=(${normalizedInner})`;
    });

    const extractJsonText = (rawText) => {
        const text = String(rawText || '').trim();
        if (!text) {
            return '';
        }
        const codeBlockMatch = text.match(/```(?:wosquery|json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch?.[1]) {
            return codeBlockMatch[1].trim();
        }
        const objectMatch = text.match(/\{[\s\S]*\}/);
        return objectMatch ? objectMatch[0].trim() : text;
    };

    const buildOpenAIWosQueryPayload = async (text, model) => {
        const systemPrompt = buildStrictWosQueryPrompt(await loadPrompt());
        return {
            'model': model || 'gpt-4o-mini',
            'input': [
                {
                    'role': 'system',
                    'content': [
                        {
                            'type': 'input_text',
                            'text': systemPrompt
                        }
                    ]
                },
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'input_text',
                            'text': `${text}`
                        }
                    ]
                }
            ],
            'text': {
                'format': {
                    'type': 'text'
                }
            },
            'tools': [],
            'temperature': 0,
            'max_output_tokens': 1024,
            'top_p': 1,
            'store': false
        };
    };

    const extractRowTextFromResult = async (rawText) => {
        const jsonText = extractJsonText(rawText);
        const parsedResult = JSON.parse(jsonText);
        const rowText = normalizeOgAndOperators(
            parsedResult?.wos_query?.[0]?.rowText || parsedResult?.[0]?.rowText || parsedResult?.rowText
        );
        if (rowText && window.wos && typeof window.wos.query === 'function') {
            await window.wos.query(rowText);
        } else if (!rowText) {
            console.warn('[WOS Query Builder] missing rowText from response:', parsedResult);
        }
        return rowText || null;
    };

    const runWosQueryByProvider = async (text) => {
        const provider = (await requestStorage("get", WOS_QUERY_PROVIDER_STORAGE_KEY)) || 'openai';
        const requestId = `wosaide-wos-query-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const response = await new Promise((resolve) => {
            const handler = (event) => {
                if (event?.detail?.requestId !== requestId) {
                    return;
                }
                document.removeEventListener("__WOS_AIDE_GENERATE_WOS_QUERY_RESPONSE__", handler);
                resolve(event.detail);
            };
            document.addEventListener("__WOS_AIDE_GENERATE_WOS_QUERY_RESPONSE__", handler);
            document.dispatchEvent(new CustomEvent("__WOS_AIDE_GENERATE_WOS_QUERY_REQUEST__", {
                detail: {
                    requestId,
                    text,
                    provider
                }
            }));
            setTimeout(() => {
                document.removeEventListener("__WOS_AIDE_GENERATE_WOS_QUERY_RESPONSE__", handler);
                resolve({ success: false, error: 'Query request timed out.' });
            }, 15000);
        });

        if (!response?.success || !response?.rowText) {
            throw new Error(response?.error || 'Failed to generate WOS query.');
        }

        const rawText = JSON.stringify({ wos_query: [{ rowText: response.rowText }] });
        return extractRowTextFromResult(rawText);
    };

    const refreshWosQueryModelHint = async () => {
        const provider = ((await requestStorage("get", WOS_QUERY_PROVIDER_STORAGE_KEY)) || 'openai').toString().trim().toLowerCase();
        let model = '';
        if (provider === 'lmstudio') {
            model = ((await requestStorage("get", LM_STUDIO_MODEL_STORAGE_KEY)) || '').toString().trim();
            wosQueryProviderBadge.textContent = 'LM Studio';
            wosQueryProviderBadge.style.background = '#f1f8f3';
            wosQueryProviderBadge.style.color = '#1f6a43';
            wosQueryProviderBadge.style.borderColor = '#cfe6d7';
            wosQueryModelIcon.innerHTML = '<i class="fa-solid fa-microchip"></i>';
            wosQueryModelIcon.style.color = '#1f6a43';
            wosQueryModelValue.textContent = model || 'not set';
            return;
        }

        model = ((await requestStorage("get", CHAT_MODEL_STORAGE_KEY)) || 'gpt-4o-mini').toString().trim() || 'gpt-4o-mini';
        wosQueryProviderBadge.textContent = 'OpenAI';
        wosQueryProviderBadge.style.background = '#eef5fb';
        wosQueryProviderBadge.style.color = '#1a5d93';
        wosQueryProviderBadge.style.borderColor = '#d2e3f2';
        wosQueryModelIcon.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        wosQueryModelIcon.style.color = '#174b78';
        wosQueryModelValue.textContent = model;
    };

    // 处理提交
    const handleWosQuery = async () => {
        const queryText = wosQueryInput.value.trim();
        if (!queryText) {
            console.warn('[WOS Query Builder] Please enter a query');
            return;
        }

        saveWosQueryHistory(queryText);
        console.log('[WOS Query Builder] Query text:', queryText);
        wosQueryBtn.disabled = true;
        const originalContent = wosQueryBtn.innerHTML;
        wosQueryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            await runWosQueryByProvider(queryText);
            console.log('[WOS Query Builder] Query executed successfully');
            wosQueryInput.value = '';
        } catch (error) {
            console.error('[WOS Query Builder] Query execution failed:', error);
            alert('Query failed: ' + (error.message || 'Unknown error'));
        } finally {
            wosQueryBtn.disabled = false;
            wosQueryBtn.innerHTML = originalContent;
        }
    };

    wosQueryBtn.onclick = handleWosQuery;

    // 支持聊天输入风格快捷键
    wosQueryInput.addEventListener('keydown', (e) => {
        if (
            e.key === 'ArrowUp' &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            wosQueryInput.selectionStart === wosQueryInput.selectionEnd &&
            isCaretOnFirstLine(wosQueryInput)
        ) {
            e.preventDefault();
            navigateWosQueryHistory(-1);
            return;
        }
        if (
            e.key === 'ArrowDown' &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            wosQueryInput.selectionStart === wosQueryInput.selectionEnd &&
            isCaretOnLastLine(wosQueryInput)
        ) {
            e.preventDefault();
            navigateWosQueryHistory(1);
            return;
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleWosQuery();
        }
    });

    wosQueryInput.addEventListener('input', () => {
        if (wosQueryHistoryIndex === -1) {
            wosQueryCurrentInput = wosQueryInput.value;
        }
    });

    refreshWosQueryModelHint();

    document.addEventListener(WOS_QUERY_ACCESS_SYNC_EVENT, () => {
        refreshWosQueryModelHint();
    });

    wosQueryActions.appendChild(wosQueryHint);
    wosQueryActions.appendChild(wosQueryBtn);
    wosQueryRow.appendChild(wosQueryInput);
    wosQueryRow.appendChild(wosQueryModelHint);
    wosQueryRow.appendChild(wosQueryActions);
    builderTabPanel.appendChild(wosQueryRow);
    resizeHandles.forEach((handle) => box.appendChild(handle));

    document.body.appendChild(box);

    // 预先声明事件处理器和清理函数
    let dragger = null;
    let resizeCleanup = null;
    let visibilityHandler, showHandler, hideHandler, outsidePointerHandler, escapeKeyHandler;

    // 清理函数
    const cleanup = () => {
        console.log("[WOS DOI Query] Cleaning up resources...");
        // 销毁拖动功能
        dragger?.destroy();
        resizeCleanup?.();
        // 移除所有事件监听器
        if (visibilityHandler) document.removeEventListener("__WOS_DOI_QUERY_VISIBILITY__", visibilityHandler);
        if (showHandler) document.removeEventListener("__SHOW_WOS_DOI_QUERY__", showHandler);
        if (hideHandler) document.removeEventListener("__HIDE_WOS_DOI_QUERY__", hideHandler);
        if (outsidePointerHandler) document.removeEventListener("mousedown", outsidePointerHandler);
        if (escapeKeyHandler) document.removeEventListener("keydown", escapeKeyHandler);
        // 移除DOM元素
        box.remove();
        console.log("[WOS DOI Query] Resources cleaned up");
    };

    // 设置关闭按钮的点击事件
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        cleanup();
    };

    singlePanelCloseBtn.onclick = (e) => {
        e.stopPropagation();
        hideSinglePanel();
    };

    singlePanelResetBtn.onclick = (e) => {
        e.stopPropagation();
        resetSinglePanelLayout(currentActiveTab);
    };

    collapseBtn.onclick = (e) => {
        e.stopPropagation();
        if (!isCollapsed) {
            expandedHeightPx = Math.max(320, box.offsetHeight);
        }
        isCollapsed = !isCollapsed;
        applyCollapsedState();
    };

    // 使用全局自由拖动功能
    dragger = window.createFreeDragger(box, controlRow, {
        topKey: POSITION_TOP_KEY,
        leftKey: POSITION_LEFT_KEY
    });

    {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        let startTop = 0;
        let resizeDirection = '';

        const onResizeMouseMove = (e) => {
            if (!isResizing || isCollapsed) return;
            const minWidth = currentPanelMode === 'single' ? 180 : 260;
            const minHeight = currentPanelMode === 'single' ? 120 : 320;
            let nextWidth = startWidth;
            let nextHeight = startHeight;
            let nextTop = startTop;

            if (resizeDirection === 'right') {
                nextWidth = Math.min(
                    Math.max(minWidth, startWidth + (e.clientX - startX)),
                    window.innerWidth - box.offsetLeft - 8
                );
                box.style.width = `${Math.round(nextWidth)}px`;
            }

            if (resizeDirection === 'bottom') {
                nextHeight = Math.min(
                    Math.max(minHeight, startHeight + (e.clientY - startY)),
                    window.innerHeight - 8
                );
                box.style.height = `${Math.round(nextHeight)}px`;
                box.style.minHeight = currentPanelMode === 'single' ? `0px` : `${Math.round(nextHeight)}px`;
                expandedHeightPx = Math.round(nextHeight);
            }

            if (resizeDirection === 'top') {
                const deltaY = e.clientY - startY;
                nextHeight = Math.max(minHeight, startHeight - deltaY);
                nextTop = startTop + deltaY;
                if (nextTop < 8) {
                    nextHeight -= (8 - nextTop);
                    nextTop = 8;
                }
                box.style.top = `${Math.round(nextTop)}px`;
                box.style.height = `${Math.round(nextHeight)}px`;
                box.style.minHeight = currentPanelMode === 'single' ? `0px` : `${Math.round(nextHeight)}px`;
                expandedHeightPx = Math.round(nextHeight);
            }

            if (currentPanelMode === 'single') {
                saveSinglePanelLayout(currentActiveTab, box.offsetWidth, box.offsetHeight);
            }
        };

        const onResizeMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            writeStorage(WIDTH_KEY, box.style.width);
            writeStorage(HEIGHT_KEY, box.style.height);
            if (currentPanelMode === 'single') {
                saveSinglePanelLayout(currentActiveTab, box.offsetWidth, box.offsetHeight);
            }
            ensurePanelInView();
            document.body.style.userSelect = "";
        };

        const onTopResizeMouseDown = (e) => {
            isResizing = true;
            resizeDirection = 'top';
            startX = e.clientX;
            startY = e.clientY;
            startWidth = box.offsetWidth;
            startHeight = expandedHeightPx;
            startTop = box.offsetTop;
            document.body.style.userSelect = "none";
            e.preventDefault();
            e.stopPropagation();
        };

        const onRightResizeMouseDown = (e) => {
            isResizing = true;
            resizeDirection = 'right';
            startX = e.clientX;
            startY = e.clientY;
            startWidth = box.offsetWidth;
            startHeight = expandedHeightPx;
            startTop = box.offsetTop;
            document.body.style.userSelect = "none";
            e.preventDefault();
            e.stopPropagation();
        };

        const onBottomResizeMouseDown = (e) => {
            isResizing = true;
            resizeDirection = 'bottom';
            startX = e.clientX;
            startY = e.clientY;
            startWidth = box.offsetWidth;
            startHeight = expandedHeightPx;
            startTop = box.offsetTop;
            document.body.style.userSelect = "none";
            e.preventDefault();
            e.stopPropagation();
        };

        topResizeHandle.addEventListener("mousedown", onTopResizeMouseDown);
        rightResizeHandle.addEventListener("mousedown", onRightResizeMouseDown);
        bottomResizeHandle.addEventListener("mousedown", onBottomResizeMouseDown);
        document.addEventListener("mousemove", onResizeMouseMove);
        document.addEventListener("mouseup", onResizeMouseUp);

        resizeCleanup = () => {
            topResizeHandle.removeEventListener("mousedown", onTopResizeMouseDown);
            rightResizeHandle.removeEventListener("mousedown", onRightResizeMouseDown);
            bottomResizeHandle.removeEventListener("mousedown", onBottomResizeMouseDown);
            document.removeEventListener("mousemove", onResizeMouseMove);
            document.removeEventListener("mouseup", onResizeMouseUp);
            document.body.style.userSelect = "";
        };
    }

    function ensurePanelInView() {
        const width = box.offsetWidth || 350;
        const height = box.offsetHeight || 320;
        const currentTop = box.style.top || savedTop;
        const currentLeft = box.style.left || savedLeft || `${window.innerWidth - 360}px`;
        const clamped = window.clampPanelPosition({
            top: currentTop,
            left: currentLeft,
            defaultTop: 80,
            defaultLeft: window.innerWidth - 360,
            width,
            height,
            margin: 0
        });
        box.style.top = `${Math.round(clamped.top)}px`;
        box.style.left = `${Math.round(clamped.left)}px`;
        box.style.right = "auto";
        writeStorage(POSITION_TOP_KEY, box.style.top);
        writeStorage(POSITION_LEFT_KEY, box.style.left);
    }

    ensurePanelInView();

    // 监听来自 content script 的可见性控制事件
    visibilityHandler = (e) => {
        console.log("[WOS DOI Query] Visibility event received:", e.detail);
        if (e.detail && typeof e.detail.visible === 'boolean') {
            const visible = e.detail.visible;
            const beforeDisplay = box.style.display;
            box.style.display = visible ? "flex" : "none";
            writeStorage(VISIBILITY_KEY, String(visible));
            const afterDisplay = box.style.display;
            console.log(`[WOS DOI Query] Display changed: ${beforeDisplay} -> ${afterDisplay}, box exists: ${!!box}, box in DOM: ${document.contains(box)}`);
            if (visible) {
                ensurePanelInView();
            }
            emitPanelState();
        }
    };
    document.addEventListener("__WOS_DOI_QUERY_VISIBILITY__", visibilityHandler);

    // 监听显示面板事件
    showHandler = () => {
        box.style.display = "flex";
        writeStorage(VISIBILITY_KEY, "true");
        emitPanelState();
        console.log("[WOS DOI Query] Panel shown");
    };
    document.addEventListener("__SHOW_WOS_DOI_QUERY__", showHandler);

    // 监听隐藏面板事件
    hideHandler = () => {
        box.style.display = "none";
        writeStorage(VISIBILITY_KEY, "false");
        emitPanelState();
        console.log("[WOS DOI Query] Panel hidden");
    };
    document.addEventListener("__HIDE_WOS_DOI_QUERY__", hideHandler);

    outsidePointerHandler = (event) => {
        if (!isSinglePanelVisible()) {
            return;
        }
        if (box.contains(event.target)) {
            return;
        }
        const toolbarShortcuts = document.getElementById('wos-aide-toolbar-shortcuts');
        if (toolbarShortcuts?.contains(event.target)) {
            return;
        }
        hideSinglePanel();
    };
    document.addEventListener("mousedown", outsidePointerHandler);

    escapeKeyHandler = (event) => {
        if (event.key !== "Escape") {
            return;
        }
        hideSinglePanel();
    };
    document.addEventListener("keydown", escapeKeyHandler);

    console.log("[WOS DOI Query] Panel initialized and event listeners attached");

})();
