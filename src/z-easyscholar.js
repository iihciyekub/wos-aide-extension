/**
 * - easyscholar 查询期刊等级的工具
 * 
 */


const mapping = {
    swufe: "西南财经大学",
    cqu: "重庆大学",
    sciif: "SCI影响因子-JCR",
    cufe: "中央财经大学",
    nju: "南京大学",
    sci: "SCI分区-JCR",
    uibe: "对外经济贸易大学",
    xju: "新疆大学",
    ssci: "SSCI分区-JCR",
    sdufe: "山东财经大学",
    cug: "中国地质大学",
    jci: "JCI指数-JCR",
    xdu: "西安电子科技大学",
    ccf: "中国计算机学会",
    sciif5: "SCI五年影响因子-JCR",
    swjtu: "西南交通大学",
    cju: "长江大学（不是计量大学）",
    sciwarn: "中科院预警",
    ruc: "中国人民大学",
    zju: "浙江大学",
    sciBase: "SCI基础版分区-中科院",
    xmu: "厦门大学",
    zhongguokejihexin: "中国科技核心期刊",
    sciUp: "SCI升级版分区-中科院",
    sjtu: "上海交通大学",
    fms: "FMS",
    ajg: "ABS学术期刊指南",
    fdu: "复旦大学",
    utd24: "UTD24",
    ft50: "FT50",
    hhu: "河海大学",
    eii: "EI检索",
    cscd: "中国科学引文数据库",
    pku: "北大核心",
    cssci: "南大核心",
    ahci: "A&HCI",
    scu: "四川大学",
    sciUpSmall: "中科院升级版小类分区",
    esi: "ESI学科分类",
    sciUpTop: "中科院升级版Top分区",
    cpu: "中国药科大学"
};


// LocalStorage keys for history
const JOURNAL_HISTORY_KEY = "wos-easyscholar-journal-history";
const MAX_HISTORY_ITEMS = 50;
const JOURNAL_LAYOUT_SYNC_EVENT = "__WOS_AIDE_JOURNAL_LAYOUT_SYNC__";

// Save journal query to history
function saveJournalQuery(journalName, result) {
    if (!result || Object.keys(result).length === 0) return;

    let history = JSON.parse(localStorage.getItem(JOURNAL_HISTORY_KEY) || "[]");

    // Remove duplicate if exists
    history = history.filter(item => item.journal !== journalName);

    // Add to beginning
    history.unshift({
        journal: journalName,
        result: result,
        timestamp: new Date().toISOString()
    });

    // Keep only MAX_HISTORY_ITEMS
    if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    localStorage.setItem(JOURNAL_HISTORY_KEY, JSON.stringify(history));
}

// Get journal history
function getJournalHistory() {
    return JSON.parse(localStorage.getItem(JOURNAL_HISTORY_KEY) || "[]");
}

// Clear journal history
function clearJournalHistory() {
    localStorage.removeItem(JOURNAL_HISTORY_KEY);
}

function getErrorMessage(error) {
    if (!error) {
        return "Unknown error";
    }
    if (typeof error === "string") {
        return error;
    }
    if (error instanceof Error) {
        return error.message || error.name || "Unknown error";
    }
    if (typeof error.message === "string" && error.message) {
        return error.message;
    }
    try {
        return JSON.stringify(error);
    } catch (_jsonError) {
        return String(error);
    }
}

async function getPublicationRank(SO) {
    const requestId = `wosaide-easyscholar-query-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
        const response = await new Promise((resolve) => {
            const handler = (event) => {
                if (event?.detail?.requestId !== requestId) {
                    return;
                }
                document.removeEventListener("__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_RESPONSE__", handler);
                resolve(event.detail);
            };
            document.addEventListener("__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_RESPONSE__", handler);
            document.dispatchEvent(new CustomEvent("__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_REQUEST__", {
                detail: {
                    requestId,
                    publicationName: SO
                }
            }));
            setTimeout(() => {
                document.removeEventListener("__WOS_AIDE_FETCH_EASYSCHOLAR_RANK_RESPONSE__", handler);
                resolve({ success: false, error: 'EasyScholar request timed out.' });
            }, 15000);
        });

        if (!response?.success || !response?.result) {
            console.warn(`请求失败：${response?.error || "unknown response"}`);
            return null;
        }

        saveJournalQuery(SO, response.result);
        return response.result;
    } catch (err) {
        console.warn(`请求失败：${getErrorMessage(err)}`);
        return null;
    }
}

/**
 * EasyScholar API Settings Panel
 */
(async function () {
    try {
    const PANEL_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const requestStorage = (action, key, value) => new Promise((resolve) => {
        const requestId = `wosaide-easyscholar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

    const loadApiKey = async (key, fallback) => {
        const value = await requestStorage("get", key);
        if (typeof value === "string" && value.trim()) {
            return value;
        }
        const legacyValue = localStorage.getItem(key);
        if (legacyValue && legacyValue.trim()) {
            requestStorage("set", key, legacyValue);
            return legacyValue;
        }
        return fallback;
    };

    const saveApiKey = (key, value) => {
        requestStorage("set", key, value || "");
    };

    // Check and remove existing instance
    const existing = document.getElementById("wos_easyscholar_panel");
    if (existing) {
        existing.remove();
        console.log("reloading EasyScholar panel");
    }
    const styleId = "wos_easyscholar_panel_style";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
#wos_easyscholar_panel {
    color: #1f2937;
    font-family: ${PANEL_FONT_STACK} !important;
    font-size: 14px !important;
}
#wos_easyscholar_panel button,
#wos_easyscholar_panel input,
#wos_easyscholar_panel textarea,
#wos_easyscholar_panel select,
#wos_easyscholar_panel div,
#wos_easyscholar_panel span,
#wos_easyscholar_panel label {
    font-family: ${PANEL_FONT_STACK} !important;
    font-size: 14px !important;
}
#wos_easyscholar_panel table,
#wos_easyscholar_panel th,
#wos_easyscholar_panel td {
    font-family: ${PANEL_FONT_STACK} !important;
    font-size: 14px !important;
}
#wos_easyscholar_panel i,
#wos_easyscholar_panel .fa-solid,
#wos_easyscholar_panel .fa-regular,
#wos_easyscholar_panel .fa-brands {
    font-family: "Font Awesome 6 Free", "Font Awesome 6 Brands" !important;
}
#wos_easyscholar_panel input::placeholder {
    color: #7b8794;
}
#wos_easyscholar_panel button {
    transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}
#wos_easyscholar_panel button:hover {
    box-shadow: none;
}
#wos_easyscholar_panel button:focus-visible,
#wos_easyscholar_panel input:focus-visible {
    outline: 2px solid #2f6fa8;
    outline-offset: 1px;
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    // Load saved position and API key from localStorage
    const POSITION_TOP_KEY = "wos-easyscholar-panel-top";
    const POSITION_LEFT_KEY = "wos-easyscholar-panel-left";
    const SETTINGS_VISIBLE_KEY = "wos-easyscholar-panel-settings-visible";
    const API_KEY_STORAGE = "wos-easyscholar-api-key";
    const API_KEY_SYNC_EVENT = "__EASYSCHOLAR_API_KEY_SYNC__";
    const savedTop = localStorage.getItem(POSITION_TOP_KEY) || "100px";
    const savedLeft = localStorage.getItem(POSITION_LEFT_KEY) || null;
    const savedSettingsVisible = localStorage.getItem(SETTINGS_VISIBLE_KEY);
    await loadApiKey(API_KEY_STORAGE, "");

    // Initialize global variable
    // Main container
    const box = document.createElement("div")
    box.id = "wos_easyscholar_panel";
    box.style.position = "fixed";
    const { top, left } = window.clampPanelPosition({
        top: savedTop,
        left: savedLeft,
        defaultTop: 100,
        defaultLeft: window.innerWidth - 520,
        width: 500,
        height: 360,
        margin: 8
    });
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
    box.style.right = "auto";
    box.style.zIndex = "999999";
    box.style.fontFamily = PANEL_FONT_STACK;
    box.style.fontSize = "14px";
    box.style.background = "#ffffff";
    box.style.padding = "0";
    box.style.borderRadius = "4px";
    box.style.display = "none"; // 默认隐藏，等待popup开启
    box.style.flexDirection = "column";
    box.style.border = "1px solid #d7dfe8";
    box.style.boxShadow = "0 1px 4px rgba(15, 23, 42, 0.08)";
    box.style.width = "500px";
    box.style.minWidth = "400px";

    // Control row
    const controlRow = document.createElement("div");
    controlRow.style.display = "flex";
    controlRow.style.alignItems = "center";
    controlRow.style.gap = "4px";
    controlRow.style.justifyContent = "space-between";
    controlRow.style.cursor = "move";
    controlRow.style.padding = "6px 10px";
    controlRow.style.background = "#174b78";
    controlRow.style.borderBottom = "1px solid #123a5c";
    controlRow.style.borderRadius = "4px 4px 0 0";

    const title = document.createElement("span");
    title.textContent = "Journal Lookup";
    title.style.color = "#fff";
    title.style.fontSize = "12px";
    title.style.fontWeight = "bold";
    title.style.letterSpacing = "0";

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.style.gap = "6px";
    titleWrap.style.minWidth = "0";
    titleWrap.style.flex = "1";

    const statusBar = document.createElement("span");
    statusBar.style.color = "rgba(255,255,255,0.82)";
    statusBar.style.fontSize = "11px";
    statusBar.style.fontWeight = "500";
    statusBar.style.whiteSpace = "nowrap";
    statusBar.style.overflow = "hidden";
    statusBar.style.textOverflow = "ellipsis";
    statusBar.style.minWidth = "0";
    statusBar.style.flex = "1 1 auto";
    statusBar.textContent = "Ready";

    titleWrap.appendChild(title);
    titleWrap.appendChild(statusBar);

    const btnGroup = document.createElement("div");
    btnGroup.style.display = "flex";
    btnGroup.style.gap = "4px";
    btnGroup.style.flexShrink = "0";

    const websiteBtn = document.createElement("button");
    websiteBtn.innerHTML = '<i class="fa-solid fa-globe"></i>';
    websiteBtn.style.background = "transparent";
    websiteBtn.style.border = "1px solid rgba(255,255,255,0.20)";
    websiteBtn.style.color = "#fff";
    websiteBtn.style.borderRadius = "4px";
    websiteBtn.style.cursor = "pointer";
    websiteBtn.style.display = "inline-flex";
    websiteBtn.style.alignItems = "center";
    websiteBtn.style.justifyContent = "center";
    websiteBtn.style.padding = "2px 6px";
    websiteBtn.style.fontSize = "11px";
    websiteBtn.title = "Visit easyscholar.cc to apply for API key";
    websiteBtn.onclick = () => {
        window.open("https://www.easyscholar.cc/", "_blank");
    };

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    closeBtn.style.background = "transparent";
    closeBtn.style.border = "1px solid rgba(255,255,255,0.20)";
    closeBtn.style.color = "#fff";
    closeBtn.style.borderRadius = "4px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.display = "inline-flex";
    closeBtn.style.alignItems = "center";
    closeBtn.style.justifyContent = "center";
    closeBtn.style.padding = "2px 6px";
    closeBtn.style.fontSize = "11px";
    closeBtn.title = "Close Panel";
    // closeBtn.onclick 将在清理函数定义后设置

    btnGroup.appendChild(websiteBtn);
    btnGroup.appendChild(closeBtn);

    controlRow.appendChild(titleWrap);
    controlRow.appendChild(btnGroup);

    const ensurePanelInView = () => {
        const width = box.offsetWidth || 500;
        const height = box.offsetHeight || 360;
        const clamped = window.clampPanelPosition({
            top: box.style.top || savedTop,
            left: box.style.left || savedLeft || `${window.innerWidth - 520}px`,
            defaultTop: 100,
            defaultLeft: window.innerWidth - 520,
            width,
            height,
            margin: 8
        });
        box.style.top = `${Math.round(clamped.top)}px`;
        box.style.left = `${Math.round(clamped.left)}px`;
        box.style.right = "auto";
        localStorage.setItem(POSITION_TOP_KEY, box.style.top);
        localStorage.setItem(POSITION_LEFT_KEY, box.style.left);
    };

    // 使用全局拖动方法
    window.createFreeDragger(box, controlRow, {
        topKey: POSITION_TOP_KEY,
        leftKey: POSITION_LEFT_KEY
    });

    ensurePanelInView();

    // Content container
    const contentBox = document.createElement("div");
    contentBox.style.display = "flex";
    contentBox.style.flexDirection = "column";
    contentBox.style.flex = "0 0 auto";
    contentBox.style.minHeight = "0";
    contentBox.style.gap = "6px";
    contentBox.style.padding = "8px";
    contentBox.style.background = "#ffffff";

    // Row 1: API Key input
    const row1 = document.createElement("div");
    row1.style.display = "flex";
    row1.style.alignItems = "center";
    row1.style.gap = "4px";
    row1.style.padding = "5px 8px";
    row1.style.background = "#ffffff";
    row1.style.border = "1px solid #dde4ec";
    row1.style.borderRadius = "2px";

    const apiLabel = document.createElement("span");
    apiLabel.textContent = "API Key:";
    apiLabel.style.color = "#274c6b";
    apiLabel.style.fontSize = "12px";
    apiLabel.style.fontWeight = "bold";
    apiLabel.style.width = "54px";
    apiLabel.style.textAlign = "right";
    apiLabel.style.whiteSpace = "nowrap";

    const apiInput = document.createElement("input");
    apiInput.type = "text";
    apiInput.placeholder = "Enter EasyScholar API Key";
    apiInput.style.flex = "1";
    apiInput.style.height = "24px";
    apiInput.style.border = "1px solid #cfd8e2";
    apiInput.style.background = "#ffffff";
    apiInput.style.padding = "0 8px";
    apiInput.style.borderRadius = "2px";
    apiInput.style.outline = "none";
    apiInput.style.fontSize = "12px";
    apiInput.style.color = "#1f3447";
    apiInput.style.boxSizing = "border-box";

    // Mask API key display (show first 6 and last 4 chars)
    function maskApiKey(key) {
        if (!key) return "";
        if (key.length <= 10) return key;
        return key.substring(0, 6) + "****" + key.substring(key.length - 4);
    }

    // Initialize display without exposing stored key into the page context.
    apiInput.value = "";

    // Store actual API key value
    let actualApiKey = "";
    let isApiFocused = false;

    const handleApiKeySync = (event) => {
        const syncedApiKey = typeof event?.detail?.apiKey === "string" ? event.detail.apiKey.trim() : actualApiKey;
        actualApiKey = syncedApiKey;
        if (!isApiFocused && actualApiKey) {
            apiInput.value = maskApiKey(actualApiKey);
        }
    };
    document.addEventListener(API_KEY_SYNC_EVENT, handleApiKeySync);

    // Show full content on focus
    apiInput.addEventListener("focus", () => {
        isApiFocused = true;
        apiInput.value = actualApiKey;
    });

    // Show masked content on blur
    apiInput.addEventListener("blur", () => {
        isApiFocused = false;
        apiInput.value = maskApiKey(actualApiKey);
    });

    // Real-time update
    apiInput.addEventListener("input", (e) => {
        if (isApiFocused) {
            actualApiKey = e.target.value.trim();
            saveApiKey(API_KEY_STORAGE, actualApiKey);
            console.log("EasyScholar API key updated");
        }
    });

    row1.appendChild(apiLabel);
    row1.appendChild(apiInput);

    // Row 2: Journal name input
    const row2 = document.createElement("div");
    row2.style.display = "flex";
    row2.style.flexDirection = "column";
    row2.style.flex = "1";
    row2.style.minHeight = "0";
    row2.style.gap = "8px";
    row2.style.padding = "10px";
    row2.style.background = "#ffffff";
    row2.style.border = "1px solid rgba(208, 217, 227, 0.6)";
    row2.style.borderRadius = "14px";
    row2.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.04)";

    const soInput = document.createElement("textarea");
    soInput.placeholder = "Enter journal name (e.g. Nature)";
    soInput.style.flex = "1";
    soInput.style.minHeight = "0";
    soInput.style.border = "none";
    soInput.style.background = "#ffffff";
    soInput.style.padding = "0";
    soInput.style.borderRadius = "0";
    soInput.style.outline = "none";
    soInput.style.fontSize = "12px";
    soInput.style.color = "#1f3447";
    soInput.style.boxSizing = "border-box";
    soInput.style.lineHeight = "1.5";
    soInput.style.resize = "none";

    // History navigation for journal input
    let historyIndex = -1;
    let currentInput = "";
    let isApplyingHistoryValue = false;
    let statusBarTimer = null; // 用于清除旧的定时器

    function setStatus(message, color) {
        if (!statusBar) {
            return;
        }
        statusBar.textContent = message;
        statusBar.style.color = color || "rgba(255,255,255,0.82)";
    }

    async function ensureApiKeyConfigured() {
        actualApiKey = ((await requestStorage("get", API_KEY_STORAGE)) || actualApiKey || "").trim();
        if (actualApiKey) {
            if (!isApiFocused) {
                apiInput.value = maskApiKey(actualApiKey);
            }
            return true;
        }
        console.warn("EasyScholar API key is not configured");
        setStatus("Please set the EasyScholar API Key in the side panel first", "#D32F2F");
        return false;
    }

    function hideApiKeyRow() {
        if (!isApiFocused) {
            apiInput.value = maskApiKey(actualApiKey);
        }
    }

    function showHistoryItem(historyItem) {
        if (!historyItem) {
            return;
        }

        isApplyingHistoryValue = true;
        soInput.value = historyItem.journal || "";
        isApplyingHistoryValue = false;

        if (historyItem.result) {
            displayResultTable(historyItem.result);
        } else {
            resultContainer.style.display = "none";
            resultTable.innerHTML = "";
        }

        if (statusBarTimer) {
            clearTimeout(statusBarTimer);
        }

        statusBar.textContent = `Loaded from history: ${historyItem.journal}`;
        statusBar.style.color = "#d8e8f6";
        statusBarTimer = setTimeout(() => {
            statusBar.textContent = "Ready";
            statusBar.style.color = "rgba(255,255,255,0.82)";
            statusBarTimer = null;
        }, 800);
    }

    function restoreManualInput() {
        historyIndex = -1;
        isApplyingHistoryValue = true;
        soInput.value = currentInput || "";
        isApplyingHistoryValue = false;
        resultContainer.style.display = "none";
        resultTable.innerHTML = "";

        if (statusBarTimer) {
            clearTimeout(statusBarTimer);
            statusBarTimer = null;
        }
        statusBar.textContent = "Ready";
        statusBar.style.color = "rgba(255,255,255,0.82)";
    }

    soInput.addEventListener("input", () => {
        if (!isApplyingHistoryValue && historyIndex === -1) {
            currentInput = soInput.value;
        }
    });

    soInput.addEventListener("keydown", async (e) => {
        const history = getJournalHistory();

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (history.length === 0) return;

            if (historyIndex === -1) {
                currentInput = soInput.value;
                historyIndex = 0;
            } else if (historyIndex < history.length - 1) {
                historyIndex++;
            }

            showHistoryItem(history[historyIndex]);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex === -1) return;

            if (historyIndex > 0) {
                historyIndex--;
                showHistoryItem(history[historyIndex]);
            } else {
                restoreManualInput();
            }
        } else if (e.key === "Enter") {
            const so = soInput.value.trim();
            if (!so) return;
            if (!(await ensureApiKeyConfigured())) return;

            // Reset history index
            historyIndex = -1;

            // Prevent multiple rapid Enter presses
            if (isQuerying) {
                console.log("Query already in progress, please wait...");
                return;
            }

            isQuerying = true;
            const originalBg = queryBtn.style.background;
            queryBtn.style.background = "rgba(56,142,60,1)";
            queryBtn.style.transform = "scale(0.95)";

            setStatus(`Querying journal: ${so}`, "#FFA500");
            console.log(`Querying journal: ${so}`);
            const result = await getPublicationRank(so);

            // Display result in table
            if (result) {
                displayResultTable(result);
                hideApiKeyRow();
                setStatus("Results loaded", "#315f86");
            } else {
                setStatus("Search failed", "#a5483f");
            }

            setTimeout(() => {
                queryBtn.style.background = originalBg;
                queryBtn.style.transform = "scale(1)";
                isQuerying = false;
                setStatus("Ready", "#174b78");
            }, 3000);
        } else {
            // Reset history index when typing
            historyIndex = -1;
        }
    });

    // Row 3: actions
    const row3 = document.createElement("div");
    row3.style.display = "flex";
    row3.style.alignItems = "center";
    row3.style.justifyContent = "space-between";
    row3.style.gap = "8px";
    row3.style.padding = "0";

    const rightActions = document.createElement("div");
    rightActions.style.display = "flex";
    rightActions.style.alignItems = "center";
    rightActions.style.gap = "4px";

    const captureBtn = document.createElement("button");
    captureBtn.textContent = "Pick";
    captureBtn.style.padding = "3px 8px";
    captureBtn.style.height = "32px";
    captureBtn.style.background = "#f7f9fb";
    captureBtn.style.color = "#274c6b";
    captureBtn.style.border = "1px solid #d0d9e3";
    captureBtn.style.borderRadius = "8px";
    captureBtn.style.cursor = "pointer";
    captureBtn.style.fontSize = "11px";
    captureBtn.style.fontWeight = "600";
    captureBtn.style.outline = "none";
    captureBtn.title = "Hover over JCR link to capture journal name";

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

    const testBtn = document.createElement("button");
    testBtn.textContent = "Open SO";
    testBtn.style.padding = "3px 8px";
    testBtn.style.height = "32px";
    testBtn.style.background = "#ffffff";
    testBtn.style.color = "#1f5a92";
    testBtn.style.border = "1px solid #c8d5e2";
    testBtn.style.borderRadius = "8px";
    testBtn.style.cursor = "pointer";
    testBtn.style.fontSize = "11px";
    testBtn.style.fontWeight = "600";
    testBtn.style.outline = "none";
    testBtn.style.whiteSpace = "nowrap";
    testBtn.title = "Open Web of Science SO query with current journal input";

    rightActions.appendChild(captureBtn);
    rightActions.appendChild(queryBtn);
    row3.appendChild(testBtn);
    row3.appendChild(rightActions);
    row2.appendChild(soInput);
    row2.appendChild(row3);

    // Capture state
    let captureEnabled = false;
    let hoverListener = null;
    let hoverOutListener = null;
    let hoverTimer = null;
    let isModifierPressed = false;
    let lastCapturedText = "";
    const INVALID_CAPTURE_PATTERNS = [
        /view journal impact/i,
        /journal information/i,
        /publisher name/i,
        /author identifiers?/i,
        /researcherid/i,
        /\borcid\b/i,
        /\babstract\b/i,
        /\bkeywords?\b/i,
        /author information/i,
        /addresses?/i,
        /research areas/i,
        /categories?\s*\/\s*classification/i,
        /funding/i,
        /accession number/i,
        /\bissn\b/i,
        /\beissn\b/i,
        /\bdoi\b/i,
        /\bpublished\b/i,
        /\bindexed\b/i,
        /source:\s*journal citation reports/i,
        /open_in_new/i,
        /arrow_back/i,
        /arrow_drop_down/i,
        /arrow_downward/i,
        /provided by clarivate/i
    ];
    const MAX_CAPTURE_LENGTH = 160;
    const MAX_CAPTURE_WORDS = 18;

    const normalizeCapturedText = (text) => String(text || "")
        .replace(/\b(?:open_in_new|arrow_back|arrow_drop_down|arrow_downward|chevron_right|expand_more|add)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const extractJournalCandidate = (text) => {
        const normalized = normalizeCapturedText(text);
        if (!normalized) {
            return "";
        }

        const sourceMatch = normalized.match(/(?:^|\b)Source\s*[:\-]?\s*([A-Z0-9&,:;()\/.\- ][A-Z0-9&()\/.\-])(?=\s+(?:Publisher name|Journal Impact Factor|Volume|Issue|DOI|Published|Indexed)\b|$)/i);
        if (sourceMatch?.[1]) {
            return normalizeCapturedText(sourceMatch[1]);
        }

        return normalized;
    };

    const isLikelyJournalCandidate = (text) => {
        const candidate = extractJournalCandidate(text);
        if (!candidate) {
            return false;
        }
        if (candidate.length > MAX_CAPTURE_LENGTH) {
            return false;
        }
        if (candidate.split(/\s+/).filter(Boolean).length > MAX_CAPTURE_WORDS) {
            return false;
        }
        if (candidate.includes("\n")) {
            return false;
        }
        if (INVALID_CAPTURE_PATTERNS.some((pattern) => pattern.test(candidate))) {
            return false;
        }
        return /[A-Za-z]/.test(candidate);
    };

    const getTextFromNode = (node) => {
        if (!node) {
            return "";
        }
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent || "").trim();
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return "";
        }
        const element = node;
        if (element.matches("input, textarea")) {
            return (element.value || "").trim();
        }
        const text = (element.textContent || "").trim();
        if (text) {
            return text;
        }
        return (element.getAttribute("title") || element.getAttribute("aria-label") || "").trim();
    };

    const getCapturedTextFromEvent = (event) => {
        const path = event.composedPath ? event.composedPath() : [];
        for (const node of path) {
            const candidate = extractJournalCandidate(getTextFromNode(node));
            if (isLikelyJournalCandidate(candidate)) {
                return candidate;
            }
        }
        const fallbackCandidate = extractJournalCandidate(getTextFromNode(event.target));
        return isLikelyJournalCandidate(fallbackCandidate) ? fallbackCandidate : "";
    };

    const isInsideExtensionPanel = (event) => {
        const path = event.composedPath ? event.composedPath() : [];
        return path.some((node) => {
            return node instanceof HTMLElement && (
                node.id === "wos_easyscholar_panel" ||
                node.id === "clipboard-reader-box" ||
                node.id === "ref-paper-downloader" ||
                node.closest?.("#wos_easyscholar_panel, #clipboard-reader-box, #ref-paper-downloader")
            );
        });
    };

    // Global hover listener for capturing
    const globalHoverListener = (e) => {
        if (isInsideExtensionPanel(e)) {
            return;
        }
        const capturedText = getCapturedTextFromEvent(e);
        if (!capturedText) {
            return;
        }

        // Method 1: If Ctrl/Cmd is pressed, just update input box (works globally)
        if (isModifierPressed || e.metaKey || e.ctrlKey) {
            soInput.value = capturedText;
            lastCapturedText = capturedText;
            return;
        }

        // Method 2: Only works when capture button is clicked - wait 1 second before auto-query
        if (captureEnabled) {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
            }

            hoverTimer = setTimeout(async () => {
                soInput.value = capturedText;
                // Auto-stop capture after successful capture
                stopCapture();
                if (!(await ensureApiKeyConfigured())) {
                    return;
                }

                // Auto-execute query
                setStatus(`Querying journal: ${capturedText}`, "#FFA500");
                console.log(`Auto-querying after 1s: ${capturedText}`);
                const result = await getPublicationRank(capturedText);

                // Display result in table
                if (result) {
                    displayResultTable(result);
                    hideApiKeyRow();
                    setStatus("Results loaded", "#315f86");
                } else {
                    setStatus("Search failed", "#a5483f");
                }
                setTimeout(() => {
                    setStatus("Ready", "#174b78");
                }, 3000);
            }, 1000); // 1 second delay
        }
    };

    // Global keydown listener - always active
    const keydownModifierHandler = (e) => {
        if (e.metaKey || e.ctrlKey) {
            if (!isModifierPressed) {
                isModifierPressed = true;
                // Visual feedback when Ctrl/Cmd is pressed
                captureBtn.style.background = "#edf4fa";
                captureBtn.style.borderColor = "#9eb6cb";
                captureBtn.textContent = "Hold";
            }
        }
    };
    document.addEventListener("keydown", keydownModifierHandler);

    // Global keyup listener - always active
    const keyupModifierHandler = async (e) => {
        // Check if modifier key is released
        if ((e.key === "Meta" || e.key === "Control") && isModifierPressed) {
            isModifierPressed = false;
            // Reset button visual
            if (captureEnabled) {
                captureBtn.style.background = "#edf4fa";
                captureBtn.style.borderColor = "#9eb6cb";
                captureBtn.textContent = "Stop";
            } else {
                captureBtn.style.background = "#f7f9fb";
                captureBtn.style.borderColor = "#d0d9e3";
                captureBtn.textContent = "Pick";
            }
            
            // When modifier key is released, execute query if text was captured
            if (lastCapturedText) {
                if (!(await ensureApiKeyConfigured())) {
                    lastCapturedText = "";
                    return;
                }
                setStatus(`Querying journal: ${lastCapturedText}`, "#FFA500");
                console.log(`Querying captured text: ${lastCapturedText}`);
                const result = await getPublicationRank(lastCapturedText);

                // Display result in table
                if (result) {
                    displayResultTable(result);
                    hideApiKeyRow();
                    setStatus("Results loaded", "#315f86");
                } else {
                    setStatus("Search failed", "#a5483f");
                }
                setTimeout(() => {
                    setStatus("Ready", "#174b78");
                }, 3000);

                lastCapturedText = "";
            }
        }
    };
    document.addEventListener("keyup", keyupModifierHandler);

    // Global mouseover listener - always active
    document.addEventListener("mouseover", globalHoverListener);

    // Function to stop capture mode
    function stopCapture() {
        captureEnabled = false;
        captureBtn.style.background = "#f7f9fb";
        captureBtn.style.borderColor = "#d0d9e3";
        captureBtn.textContent = "Pick";

        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }

        if (hoverOutListener) {
            document.removeEventListener("mouseout", hoverOutListener);
            hoverOutListener = null;
        }

        lastCapturedText = "";
    }

    // Capture button click event
    captureBtn.addEventListener("click", () => {
        if (captureEnabled) {
            // If already enabled, stop capture
            stopCapture();
        } else {
            // Enable capture mode (for Method 2 - 1 second delay)
            captureEnabled = true;
            captureBtn.style.background = "#edf4fa";
            captureBtn.style.borderColor = "#9eb6cb";
            captureBtn.textContent = "Stop";

            // Add mouseout listener to cancel timer for Method 2
            hoverOutListener = (e) => {
                if (hoverTimer && !isModifierPressed) {
                    clearTimeout(hoverTimer);
                    hoverTimer = null;
                }
            };

            document.addEventListener("mouseout", hoverOutListener);
        }
    });

    // Query button click event with debounce
    let isQuerying = false;
    queryBtn.addEventListener("click", async () => {
        const so = soInput.value.trim();
        if (!so) {
            console.warn("Please enter journal name");
            return;
        }
        if (!(await ensureApiKeyConfigured())) {
            return;
        }

        // Prevent multiple clicks
        if (isQuerying) {
            console.log("Query already in progress, please wait...");
            return;
        }

        isQuerying = true;
        const originalBg = queryBtn.style.background;
        queryBtn.style.background = "#123f67";
        queryBtn.style.transform = "scale(0.95)";
        queryBtn.style.borderColor = "#0f3352";

        setStatus(`Querying journal: ${so}`, "#FFA500");
        console.log(`Querying journal: ${so}`);
        const result = await getPublicationRank(so);

        // Display result in table
        if (result) {
            displayResultTable(result);
            hideApiKeyRow();
            setStatus("Results loaded", "#315f86");
        } else {
            setStatus("Search failed", "#a5483f");
        }

        // Reset button state
        setTimeout(() => {
            queryBtn.style.background = originalBg;
            queryBtn.style.borderColor = "#123a5c";
            queryBtn.style.transform = "scale(1)";
            isQuerying = false;
            setStatus("Ready", "#174b78");
        }, 3000);
    });

    // Open SO button click event
    testBtn.addEventListener("click", async () => {
        const so = soInput.value.trim();
        if (!so) {
            setStatus("Please enter journal name first", "#D32F2F");
            return;
        }

        if (!window.wos || typeof window.wos.query !== "function") {
            setStatus("wos.query is unavailable", "#D32F2F");
            console.warn("window.wos.query is unavailable");
            return;
        }

        setStatus(`Opening SO query: ${so}`, "#FFA500");
        try {
            await window.wos.query(`SO=${so}`);
            setStatus("SO search opened", "#315f86");
        } catch (error) {
            console.warn(`Failed to open SO query: ${getErrorMessage(error)}`);
            setStatus("Failed to open SO search", "#a5483f");
        }
    });

    contentBox.appendChild(row2);

    // Result table container
    const resultContainer = document.createElement("div");
    resultContainer.style.display = "none";
    resultContainer.style.flexShrink = "0";
    resultContainer.style.maxHeight = "none";
    resultContainer.style.overflow = "visible";
    resultContainer.style.background = "#ffffff";
    resultContainer.style.border = "1px solid #dde4ec";
    resultContainer.style.borderRadius = "10px";
    resultContainer.style.marginTop = "4px";

    const resultTable = document.createElement("table");
    resultTable.style.width = "100%";
    resultTable.style.borderCollapse = "collapse";
    resultTable.style.setProperty("font-size", "12px", "important");
    resultTable.style.fontFamily = "Consolas, 'Courier New', monospace";

    resultContainer.appendChild(resultTable);
    contentBox.appendChild(resultContainer);

    const syncJournalLayout = () => {
        document.dispatchEvent(new CustomEvent(JOURNAL_LAYOUT_SYNC_EVENT, {
            detail: {
                visible: resultContainer.style.display !== "none",
                contentHeight: contentBox.scrollHeight || 0
            }
        }));
    };

    // Function to display result in table
    function displayResultTable(result) {
        if (!result || Object.keys(result).length === 0) {
            resultContainer.style.display = "none";
            syncJournalLayout();
            return;
        }

        resultTable.innerHTML = "";

        // Create table header
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        const th1 = document.createElement("th");
        th1.textContent = "Indicator";
        th1.style.padding = "4px 7px";
        th1.style.setProperty("font-size", "12px", "important");
        th1.style.textAlign = "left";
        th1.style.background = "#f6f8fb";
        th1.style.color = "#234765";
        th1.style.fontWeight = "bold";
        th1.style.borderBottom = "1px solid #dde4ec";

        const th2 = document.createElement("th");
        th2.textContent = "Value";
        th2.style.padding = "4px 7px";
        th2.style.setProperty("font-size", "12px", "important");
        th2.style.textAlign = "left";
        th2.style.background = "#f6f8fb";
        th2.style.color = "#234765";
        th2.style.fontWeight = "bold";
        th2.style.borderBottom = "1px solid #dde4ec";

        headerRow.appendChild(th1);
        headerRow.appendChild(th2);
        thead.appendChild(headerRow);
        resultTable.appendChild(thead);

        // Create table body
        const tbody = document.createElement("tbody");

        for (const [key, value] of Object.entries(result)) {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid #eef3f7";

            const td1 = document.createElement("td");
            td1.textContent = key;
            td1.style.padding = "2px 7px";
            td1.style.setProperty("font-size", "12px", "important");
            td1.style.color = "#486581";

            const td2 = document.createElement("td");
            td2.textContent = value || "-";
            td2.style.padding = "2px 7px";
            td2.style.setProperty("font-size", "12px", "important");
            td2.style.color = "#243b53";
            td2.style.fontWeight = "600";

            row.appendChild(td1);
            row.appendChild(td2);
            tbody.appendChild(row);
        }

        resultTable.appendChild(tbody);
        resultContainer.style.display = "block";
        syncJournalLayout();
    }

    const focusPanelInput = () => {
        if (!soInput || typeof soInput.focus !== "function") {
            return;
        }
        setTimeout(() => {
            try {
                soInput.focus({ preventScroll: true });
                if (typeof soInput.select === "function") {
                    soInput.select();
                }
            } catch (error) {
                soInput.focus();
            }
        }, 0);
    };



    box.appendChild(controlRow);
    box.appendChild(contentBox);

    document.body.appendChild(box);

    // 监听来自 content script 的可见性控制事件
    const visibilityHandler = (e) => {
        if (box.dataset.embeddedInBatchQuery === 'true') {
            return;
        }
        console.log("[EasyScholar] Visibility event received:", e.detail);
        if (e.detail && typeof e.detail.visible === 'boolean') {
            const visible = e.detail.visible;
            const beforeDisplay = box.style.display;
            box.style.display = visible ? "flex" : "none";
            const afterDisplay = box.style.display;
            console.log(`[EasyScholar] Display changed: ${beforeDisplay} -> ${afterDisplay}, box exists: ${!!box}, box in DOM: ${document.contains(box)}`);
            if (visible) {
                ensurePanelInView();
                focusPanelInput();
            }
        }
    };
    document.addEventListener("__EASYSCHOLAR_VISIBILITY__", visibilityHandler);
    if (box.style.display !== "none") {
        focusPanelInput();
    }

    // 清理函数
    const cleanup = () => {
        console.log("[EasyScholar] Cleaning up resources...");
        // 移除所有全局事件监听器
        document.removeEventListener("__EASYSCHOLAR_VISIBILITY__", visibilityHandler);
        document.removeEventListener(API_KEY_SYNC_EVENT, handleApiKeySync);
        document.removeEventListener("keydown", keydownModifierHandler);
        document.removeEventListener("keyup", keyupModifierHandler);
        document.removeEventListener("mouseover", globalHoverListener);
        if (hoverOutListener) {
            document.removeEventListener("mouseout", hoverOutListener);
        }
        // 清理定时器
        if (hoverTimer) {
            clearTimeout(hoverTimer);
        }
        // 重置捕获状态
        captureEnabled = false;
        isModifierPressed = false;
        lastCapturedText = "";
        // 移除DOM元素
        box.remove();
        console.log("[EasyScholar] Resources cleaned up");
    };

    // 设置关闭按钮的点击事件
    closeBtn.onclick = () => {
        cleanup();
    };

    } catch (error) {
        console.warn(`EasyScholar panel init failed: ${getErrorMessage(error)}`);
    }

})();
