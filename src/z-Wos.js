/** 
 * core code
*/
const $ = window.jQuery || window.$;
if ($) {
    window.jQuery = window.$ = $;
} else {
    console.warn('[WOS] jQuery not detected. Ensure jquery-3.7.0.js is injected before z-Wos.js.');
}

class WebFuncs {
    static instance = null;
    static autoScrollTimer = null;
    static oneTrustAutoCloser = null;

    constructor() {
        if (WebFuncs.instance) return WebFuncs.instance;
        WebFuncs.instance = this;
        // jQuery is injected by z-Wos-loader.js
    }

    /**
     * 简单随机 hex
     */
    #randomHex(len) {
        const arr = new Uint8Array(len);
        if (crypto.getRandomValues) {
            crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        return [...arr].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
    }

    /**
     * 简单 UUID（你原来的格式）
     */
    random_uuid() {
        const parts = [8, 4, 4, 4, 12, 10].map(n => this.#randomHex(n));
        return parts.join('-');
    }

    /**
     * 延时 毫秒
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * jQuery is injected at runtime by z-Wos-loader.js
     * This method is kept for backward compatibility
     */
    ensureJquery(callback) {
        if (window.jQuery || window.$) {
            if (callback) callback();
            return;
        }
        console.warn('[WOS] jQuery not ready yet.');
    }

    /**
     * 保存 JSON 文件
     */
    saveToFile(obj, name = 'data') {
        const blob = new Blob([JSON.stringify(obj, null, 2)], {
            type: 'application/json;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    saveToBibFile(obj, name = 'data') {
        // 支持数组或对象，转换为 bib 格式文本
        function toBib(item) {
            if (!item) return '';
            const type = item.entryType || 'article';
            const key = item.citeKey || item.id || name;
            let bib = `@${type}{${key},\n`;
            for (const [k, v] of Object.entries(item)) {
                if (k === 'entryType' || k === 'citeKey' || k === 'id') continue;
                bib += `  ${k} = {${v}},\n`;
            }
            bib += '}\n';
            return bib;
        }
        let bibText = '';
        if (Array.isArray(obj)) {
            bibText = obj.map(toBib).join('\n');
        } else {
            bibText = toBib(obj);
        }
        const blob = new Blob([bibText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.bib`;
        a.click();
        URL.revokeObjectURL(url);
    }


    /**
     * 保存文本文件到本地
     */
    async saveTextToFile(text, name = 'text', ext = 'txt', addBOM = false) {
        const content = addBOM ? '\uFEFF' + String(text) : String(text);
        const fileName = `${name}.${ext}`;
        const handle = await this.#getStoredDirectoryHandle();
        if (handle) {
            const success = await this.#writeTextToDirectory(handle, fileName, content);
            console.log(`[WOS] Silent write to directory ${handle.name} for file ${fileName} ${success ? 'succeeded' : 'failed'}`);
            if (success) return true;
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        // some browsers require the link to be in the document
        document.body.appendChild(a);
        a.click();
        a.remove();
        // revoke after a short delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return false;
    }

    async #openProjectHandleStore() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('wosaide-toolkit', 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore('projectHandles');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async #getStoredDirectoryHandle() {
        try {
            const db = await this.#openProjectHandleStore();
            return await new Promise((resolve) => {
                const tx = db.transaction('projectHandles', 'readonly');
                const store = tx.objectStore('projectHandles');
                const getReq = store.get('default');
                getReq.onsuccess = () => resolve(getReq.result || null);
                getReq.onerror = () => resolve(null);
            });
        } catch (error) {
            console.warn('[WOS] Failed to read project handle:', error);
            return null;
        }
    }

    async #ensureDirectoryPermission(handle) {
        try {
            const opts = { mode: 'readwrite' };
            if (await handle.queryPermission(opts) === 'granted') return true;
            return (await handle.requestPermission(opts)) === 'granted';
        } catch (error) {
            console.warn('[WOS] Directory permission check failed:', error);
            return false;
        }
    }

    async #writeTextToDirectory(handle, fileName, content) {
        try {
            if (!await this.#ensureDirectoryPermission(handle)) {
                return false;
            }
            const fileHandle = await handle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (error) {
            console.warn('[WOS] Silent write failed, fallback to download:', error);
            return false;
        }
    }

    /**
     - 自动滚动页面到底部，速度可调节
     */
    autoScroll(speed = 200) {
        return new Promise((resolve) => {
            // 避免重复开启
            if (WebFuncs.autoScrollTimer) return resolve();
            // 回到顶部
            window.scrollTo(0, 0);
            WebFuncs.autoScrollTimer = setInterval(() => {
                window.scrollBy(0, speed);
                // 是否到底部
                if ($(window).scrollTop() + $(window).height() + 20 >= $(document).height()) {
                    clearInterval(WebFuncs.autoScrollTimer);
                    WebFuncs.autoScrollTimer = null;
                    resolve();
                }
            }, 10);
        });
    }

    // 手动停止
    stopAutoScroll(resolveFn) {
        if (WebFuncs.autoScrollTimer) {
            clearInterval(WebFuncs.autoScrollTimer);
            WebFuncs.autoScrollTimer = null;
            if (resolveFn) resolveFn();  // 手动停止也结束
        }
    }

    /**
     * 自动关闭 OneTrust cookie 弹窗（MutationObserver + 低频轮询兜底）
     */
    startOneTrustAutoClose(options = {}) {
        if (WebFuncs.oneTrustAutoCloser) return WebFuncs.oneTrustAutoCloser;

        const {
            intervalMs = 1500,
            minClickGapMs = 500,
            debug = false,
        } = options;

        const selectors = [
            // OneTrust
            'button.onetrust-close-btn-handler.onetrust-close-btn-ui.banner-close-button.ot-close-icon',
            'button[aria-label="Close"].onetrust-close-btn-handler',
            '#onetrust-close-btn-container button',
            // Pendo guide close button
            'button._pendo-close-guide[aria-label="Close"]',
            'button[id^="pendo-close-guide-"]',
        ];

        let lastClickAt = 0;

        const clickCloseBtn = () => {
            const now = Date.now();
            if (now - lastClickAt < minClickGapMs) return false;

            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (!btn) continue;
                if (btn.disabled) continue;
                const style = window.getComputedStyle(btn);
                if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;

                btn.click();
                lastClickAt = now;
                if (debug) console.debug('[WOS] OneTrust close button clicked:', selector);
                return true;
            }
            return false;
        };

        const observer = new MutationObserver(() => {
            clickCloseBtn();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'aria-hidden'],
        });

        // 首次与兜底触发
        clickCloseBtn();
        const timer = setInterval(clickCloseBtn, intervalMs);

        WebFuncs.oneTrustAutoCloser = {
            stop: () => {
                observer.disconnect();
                clearInterval(timer);
                WebFuncs.oneTrustAutoCloser = null;
            },
            clickOnce: clickCloseBtn,
        };
        return WebFuncs.oneTrustAutoCloser;
    }

    stopOneTrustAutoClose() {
        WebFuncs.oneTrustAutoCloser?.stop?.();
    }

    clearConsoleHistory() {
        // 1) 先看看有哪些 key（可选）
        Object.keys(localStorage).filter(k => k.includes("console"))

        // 2) 删除 console-history
        localStorage.removeItem("console-history");

        // 3) 如果还有类似的 console-history 分片/相关项，就一起删
        for (const k of Object.keys(localStorage)) {
            if (k.includes("console") || k.includes("history")) localStorage.removeItem(k);
        }

        // 4) 兜底：直接清空 DevTools 的 localStorage（会影响更多 DevTools 设置）
        /* localStorage.clear(); */
    }

}
const asy_webFuncs = new WebFuncs();

















class WebWait {
    static instance = null;
    constructor() {
        if (WebWait.instance) return WebWait.instance;
        WebWait.instance = this;
    }

    /** 
    - 返回匹配到的第一个元素对象；未找到则返回 null 
    - cssSelector: jQuery 选择器字符串
    - maxTry: 100 最大尝试次数
    - interval: 100 每次尝试的间隔时间，单位毫秒
     * */
    async forElemBycssSelector(cssSelector, maxTry = 100, interval = 100) {

        for (let i = 0; i < maxTry; i++) {
            try {
                const $el = $(cssSelector);
                if ($el.length) return $el[0]; // 返回 DOM 元素

                // 如果是错误页面，直接返回 null
                if (document.querySelector('.error-content.ng-star-inserted')) {
                    return null;
                }
            } catch (e) {
                // 忽略错误，继续轮询
            }
            await asy_webFuncs.sleep(interval);
        }
        return null; // 超时未找到
    }

    /** 
    - 检查元素是否还在,直到元素消失或超时
    - cssSelector: jQuery 选择器字符串
    - maxTry: 100 最大尝试次数
    - interval: 100 每次尝试的间隔时间，单位毫秒
     * */
    async forElemDisplayBycssSelector(cssSelector, maxTry = 100, interval = 100) {
        for (let i = 0; i < maxTry; i++) {
            try {
                const $el = $(cssSelector);
                if ($el.length === 0) return null;

            } catch (e) {
                // 忽略错误，继续轮询
            }
            await asy_webFuncs.sleep(interval);
        }
        return null; // 超时未找到
    }

    async forElemChangeBycssSelector(cssSelector, value, maxTry = 100, interval = 100) {
        for (let i = 0; i < maxTry; i++) {
            try {
                if ($(cssSelector).length !== value) {
                    return true; // 找到
                }
            } catch (e) {
                // 可能jQuery未加载等异常
            }
            await asy_webFuncs.sleep(interval);
        }
        return null; // 超时未找到
    }

    /**
     * - 检查指定元素内是否包含指定文本内容
    */
    async forElem_inncludes_text_BycssSelector(cssSelector, value, maxTry = 100, interval = 100) {
        for (let i = 0; i < maxTry; i++) {
            try {
                if ($(cssSelector).text().includes(value)) {
                    return true; // 找到
                }
            } catch (e) {
                // 可能jQuery未加载等异常
            }
            await asy_webFuncs.sleep(interval);
        }
        return null; // 超时未找到
    }


    async forURL_change(maxTry = 100, interval = 100) {
        const start_url = window.location.pathname;
        for (let i = 0; i < maxTry; i++) {
            try {
                if (window.location.pathname !== start_url) {
                    return true; // 找到
                }
            } catch (e) {
                // 可能jQuery未加载等异常
            }
            await asy_webFuncs.sleep(interval);
        }
        return null; // 超时未找到
    }

}
const asy_webWait = new WebWait();
















class WosInfo {
    static instance = null;
    constructor() {
        if (WosInfo.instance) return WosInfo.instance;
        WosInfo.instance = this;
    }

    get SID() {
        return window.sessionData.BasicProperties.SID || '';
    }

}

const asy_wosInfo = new WosInfo();















class WosGoto {
    static instance = null;

    constructor() {
        if (WosGoto.instance) return WosGoto.instance;
        WosGoto.instance = this;
    }

    /**
     * 进入高级搜索页面
     */
    async adv_search_page() {
        // 进入高级搜索页面
        if (window.location.pathname.startsWith("/wos/woscc/advanced-search")) {
            return;
        }
        window.history.pushState({}, "", "/wos/woscc/advanced-search");
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forElemBycssSelector("#advancedSearchInputArea", 50);
    }

    /**
     * 进入基本搜索页面
     */
    async base_search_page() {
        // 进入基本搜索页面
        if (window.location.pathname.startsWith("/wos/woscc/basic-search")) {
            return;
        }
        window.history.pushState({}, "", "/wos/woscc/basic-search");
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forElemBycssSelector('div[data-ta="search-terms"]', 50);
    }

    /**
     - 跳转至可以快速搜索的文献主页面  
    */
    async init_uuid_page() {
        // 默认进入示例 uuid 页面
        const href = `/wos/woscc/summary/71bc6d46-a5e5-40b3-abd6-79f92952b7fe-01896f03a6/relevance/1`
        if (window.location.pathname === href) {
            return;
        }
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        const css = 'a[data-ta="summary-record-title-link"]';
        const text = 'HELLO, WORLD';
        await asy_webWait.forElem_inncludes_text_BycssSelector(css, text, 100);
    }

    /**
     * 退出登录
     */
    sign_out() {
        window.history.pushState({}, "", "/wos/my/sign-out");
        window.dispatchEvent(new Event("popstate"));
    }

    // 用 must 的帐户跳转至出版本商的 DOI 页面
    doi(doi) {
        window.open(`https://doi-org.libezproxy.must.edu.mo/${doi}`, "_blank");
    }

    async page(href) {
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forURL_change(50);
    }

}
const asy_wosGoto = new WosGoto();










































/**
 - 单例模式管理 WOS ID（UT） 
 */
class WosUT {
    static instance = null;
    static def_value = 'A1993KH59100006';
    constructor() {
        if (WosUT.instance) return WosUT.instance;
        WosUT.instance = this;
        this._value = 'A1993KH59100006';
        this.db = {}; // 本地缓存 wosid 数据
    }

    save(wosid, data) {
        // 适配 wosid 格式：如果没有冒号则自动加上前缀
        if (!wosid) {
            console.warn('No WOS ID provided to save().');
            return;
        }
        if (!wosid.includes(':')) {
            wosid = `WOS:${String(wosid).trim()}`;
        }

        if (!this.db[wosid]) this.db[wosid] = {};

        const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

        const deepEqual = (a, b) => {
            if (a === b) return true;
            try {
                return JSON.stringify(a) === JSON.stringify(b);
            } catch (e) {
                return false;
            }
        };

        const mergeArrays = (oldArr, newArr) => {
            const res = oldArr.slice();
            newArr.forEach(n => {
                const exists = res.some(o => deepEqual(o, n));
                if (!exists) res.push(n);
            });
            return res;
        };

        const mergeValues = (oldVal, newVal) => {
            if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                return mergeArrays(oldVal, newVal);
            }
            if (isPlainObject(oldVal) && isPlainObject(newVal)) {
                const merged = { ...oldVal };
                for (const k of Object.keys(newVal)) {
                    if (k in merged) {
                        merged[k] = mergeValues(merged[k], newVal[k]);
                    } else {
                        merged[k] = newVal[k];
                    }
                }
                return merged;
            }
            if (Array.isArray(oldVal) && !Array.isArray(newVal)) {
                const exists = oldVal.some(o => deepEqual(o, newVal));
                return exists ? oldVal.slice() : oldVal.concat([newVal]);
            }
            if (!Array.isArray(oldVal) && Array.isArray(newVal)) {
                const base = Array.isArray(oldVal) ? oldVal.slice() : (oldVal === undefined ? [] : [oldVal]);
                return mergeArrays(base, newVal);
            }
            return newVal;
        };

        for (const key of Object.keys(data || {})) {
            const newVal = data[key];
            if (key in this.db[wosid]) {
                this.db[wosid][key] = mergeValues(this.db[wosid][key], newVal);
            } else {
                this.db[wosid][key] = Array.isArray(newVal) ? newVal.slice() : (isPlainObject(newVal) ? { ...newVal } : newVal);
            }
        }
    }

    /**
     - 设置 wosid 的值,弱判断处理,只要有包含:则认为是完整 wosid格式
     */
    set value(value = '') {
        if (!value) {
            return;
        };
        if (value.includes(":")) {
            this._value = value;
        } else {
            this._value = `WOS:${value}`;
        }
    }

    /**
     - 获取 wosid 的值
     */
    get value() {
        return this._value;
    }

    async update() {
        const href = window.location.href;
        const wosid = href.split('/').pop();
        if (!wosid.includes(':')) {
            console.log('Not on a WOS record page. Cannot update WOS ID.');
            return;
        }
        // 更新 wosid 全局值
        this._value = wosid;
        console.log('wosid updated to:', this._value);
    }

    /**
     - 打开 wosid 的详细页面
     */
    async open(wosid = '') {
        this.value = wosid;
        // 跳转到 wosid 页面
        const href = `/wos/woscc/full-record/${this.value}`;
        if (window.location.pathname !== href) {
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
            await asy_webFuncs.sleep(250);
            await asy_webWait.forElemBycssSelector("#FullRTa-fullRecordtitle-0", 50);
        }
    }

    /**
     - 打开 wosid 的引用页面
     */
    async citations(wosid = '') {
        this.value = wosid;
        // 判断是否已经在 wosid 引用页面
        const $page_wosid = $("#GenericFD-article-metadata-parentUtLink")
        if ($page_wosid.length) {
            const page_wosid = $page_wosid.attr('href');
            if (page_wosid.includes(this.value)) {
                if ($page_wosid.text().includes('Citations of')) {
                    console.log('Already on the citations page for this WOS ID.');
                    return;
                }
            }
        }
        // 跳转到 wosid 引用页面
        const href = `/wos/woscc/citing-summary/${this.value}?from=woscc&type=colluid&eventMode=timeCitedOnSummary`
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forURL_change(50);
        const css = '#GenericFD-article-metadata-parent'
        const value = 'Citations of';
        await asy_webWait.forElem_inncludes_text_BycssSelector(css, value, 50);
        await this.#save_citations();
    }

    async #save_citations() {
        const res = await asy_uuid.info(`citations of ${this.value}`);
        this.save(this.value, { 'citations': res });
    }

    /**
     - wosid 参考文献页面
     */
    async references(wosid = '') {
        this.value = wosid;
        // 判断是否已经在 wosid 引用页面
        const $page_wosid = $("#GenericFD-article-metadata-parentUtLink")
        if ($page_wosid.length) {
            const page_wosid = $page_wosid.attr('href');
            if (page_wosid.includes(this.value)) {
                if ($page_wosid.text().includes('References of')) {
                    console.log('Already on the citations page for this WOS ID.');
                    return;
                }
            }
        }
        // 跳转到 wosid 参考文献的uuid 页面
        const href = `/wos/woscc/cited-references-summary/${this.value}?type=colluid&from=woscc`
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forURL_change(50);
        const css = '#GenericFD-article-metadata-parent'
        const value = 'References of';
        await asy_webWait.forElem_inncludes_text_BycssSelector(css, value, 50);
        await this.#save_references();
    }

    async #save_references() {
        const res = await asy_uuid.info(`references of ${this.value}`);
        this.save(this.value, { 'references': res });
    }

    /**
     - 打开 wosid 相关的文献页面
     */
    async related(wosid = '') {
        this.value = wosid;
        // 判断是否已经在 wosid 引用页面
        const $page_wosid = $("#GenericFD-article-metadata-parentUtLink")
        if ($page_wosid.length) {
            const page_wosid = $page_wosid.attr('href');
            if (page_wosid.includes(this.value)) {
                if ($page_wosid.text().includes('Related to')) {
                    console.log('Already on the citations page for this WOS ID.');
                    return;
                }
            }
        }
        // 跳转到 wosid 参考文献的uuid 页面
        const href = `/wos/woscc/related-records-summary/${this.value}?type=colluid&from=woscc`
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forURL_change(50);
        const css = '#GenericFD-article-metadata-parent'
        const value = 'Related to';
        await asy_webWait.forElem_inncludes_text_BycssSelector(css, value, 50);
        await this.#save_related();
    }

    async #save_related() {
        const res = await asy_uuid.info(`related of ${this.value}`);
        this.save(this.value, { 'related': res });
    }

    /**
     * wosid1 和 wosid2 之间的共享参考文献页面
     */
    async sharedRef_between(wosid1, wosid2) {
        if (!wosid1.includes(":")) {
            wosid1 = `WOS:${wosid1}`;
        }
        if (!wosid2.includes(":")) {
            wosid2 = `WOS:${wosid2}`;
        }

        const href = `/wos/woscc/shared-references-summary/${wosid1}/${wosid2}?type=colluid&from=woscc`
        window.history.pushState({}, "", href);
        window.dispatchEvent(new Event("popstate"));
        await asy_webWait.forURL_change(50);
        const css = '#GenericFD-article-metadata-parent'
        const value = 'Shared references between';
        await asy_webWait.forElem_inncludes_text_BycssSelector(css, value, 50);
        await this.#save_sharedRef_between(wosid1, wosid2);
    }

    async #save_sharedRef_between(wosid1, wosid2) {
        const res = await asy_uuid.info(`Shared references between ${wosid1} and ${wosid2}`);
        if (res) {
            asy_uuid.value = res.uuid
            asy_uuid.save([res.uuid], res);
        }
    }

    /**
     * - 请求获取 wosid 的文献信息
     */
    async info(wosid = '') {
        this.value = wosid;
        // 构造请求体
        const jsondata = {
            'ids': [this.value],
            'displayTimesCited': 'true',
            'displayCitedRefs': 'true',
            'product': 'UA',
            'colName': 'WOS',
            'displayUsageInfo': 'true',
            'fileOpt': 'othersoftware',
            'action': 'saveToTab',
            'locale': 'en_US',
            'view': 'fullrec',
            filters: "fullRecord"
        }
        // 发送请求
        try {
            // https://www.webofscience.com/api/wosnx/indic/export/saveToFile
            const response = await fetch(`${window.location.origin}/api/wosnx/indic/export/saveToFile`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en,zh-TW;q=0.9,zh;q=0.8',
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                    'origin': window.location.origin,
                    'pragma': 'no-cache',
                    'priority': 'u=1, i',
                    'referer': window.location.href + "(overlay:export/ext)",
                    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                    'x-1p-wos-sid': window.sessionData.BasicProperties.SID,
                    'cookie': document.cookie
                },
                body: JSON.stringify(jsondata)
            });

            if (!response.ok) {
                console.error(`request:uuid: ${uuid} \n status code: ${response.status}`);
                return null;
            }
            const text = await response.text();
            // 解析 TSV 数据
            const lines = text.trim().split("\n");
            const headers = lines[0].split("\t");
            const json = lines.slice(1).map(line =>
                Object.fromEntries(
                    line.split("\t")
                        .map((v, i) => [headers[i].trim(), v.trim()])
                )
            );
            // 保存数据到本地缓存
            this.save(this.value, json[0]);
            return { [this.value]: json[0] };
        } catch (e) {
            return null;
        }
    }

}
const asy_wosid = new WosUT();












































class WosUUID {
    static instance = null;
    static def_value = '71bc6d46-a5e5-40b3-abd6-79f92952b7fe-01896f03a6';
    constructor() {
        if (WosUUID.instance) return WosUUID.instance;
        WosUUID.instance = this;
        this._value = WosUUID.def_value;
        this.db = {}; // 本地缓存 uuid 数据
    }

    /**
     * 验证 uuid 格式（8-4-4-4-12-10 的十六进制组合）
     * 返回 boolean
     */
    valid(uuid = '') {
        const s = String(uuid).trim();
        const re = /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/;
        return re.test(s);
    }

    /**
     * 从文本中提取 uuid
     */
    extract(text = '') {
        const s = String(text || '');
        const re = /[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}-[A-Fa-f0-9]{10}/;
        const m = s.match(re);
        return m ? m[0] : null;
    }

    /** 
     - 合并并保存 uuid 相关数据 
     * */
    save(uuid, data) {
        // const uuid = this.extract(window.location.href) || WosUUID.def_value;
        if (!this.db[uuid]) this.db[uuid] = {};

        const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

        const deepEqual = (a, b) => {
            // 简单的深度比较，适用于常见对象/数组/基本类型
            if (a === b) return true;
            try {
                return JSON.stringify(a) === JSON.stringify(b);
            } catch (e) {
                return false;
            }
        };

        const mergeArrays = (oldArr, newArr) => {
            const res = oldArr.slice();
            newArr.forEach(n => {
                const exists = res.some(o => deepEqual(o, n));
                if (!exists) res.push(n);
            });
            return res;
        };

        const mergeValues = (oldVal, newVal) => {
            if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                return mergeArrays(oldVal, newVal);
            }
            if (isPlainObject(oldVal) && isPlainObject(newVal)) {
                const merged = { ...oldVal };
                for (const k of Object.keys(newVal)) {
                    if (k in merged) {
                        merged[k] = mergeValues(merged[k], newVal[k]);
                    } else {
                        merged[k] = newVal[k];
                    }
                }
                return merged;
            }
            // 如果旧值是数组但新值不是，尝试把新值作为数组项加入（避免重复）
            if (Array.isArray(oldVal) && !Array.isArray(newVal)) {
                const exists = oldVal.some(o => deepEqual(o, newVal));
                return exists ? oldVal.slice() : oldVal.concat([newVal]);
            }
            // 如果旧值不是数组但新值是数组，将旧值与新数组合并
            if (!Array.isArray(oldVal) && Array.isArray(newVal)) {
                const base = Array.isArray(oldVal) ? oldVal.slice() : (oldVal === undefined ? [] : [oldVal]);
                return mergeArrays(base, newVal);
            }
            // 其他情况（基本类型或类型不匹配），以新值为准（覆盖）
            return newVal;
        };

        for (const key of Object.keys(data || {})) {
            const newVal = data[key];
            if (key in this.db[uuid]) {
                this.db[uuid][key] = mergeValues(this.db[uuid][key], newVal);
            } else {
                // 直接赋值（深拷贝浅实现）
                this.db[uuid][key] = Array.isArray(newVal) ? newVal.slice() : (isPlainObject(newVal) ? { ...newVal } : newVal);
            }
        }
    }

    /**
    - 设置 uuid 的值,自动验证格式       
    */
    set value(uuid = '') {
        if (!uuid) return;
        uuid = String(uuid).trim();
        if (!this.valid(uuid)) {
            console.warn(`Invalid UUID format: ${uuid}. Expected pattern 8-4-4-4-12-10 of hex chars.`);
            return;
        }
        this._value = uuid;
    }

    get value() {
        return this._value;
    }

    /**
     * - 获取当前页面的 uuid 信息
    */
    async info(note = '') {
        // 等待显示文献数据的元素是否有出现
        let res = {};
        const ele = await asy_webWait.forElemBycssSelector("span.brand-blue");
        if (!ele) {
            res = {
                uuid: '',
                ref_count: '',
                rowText: '',
                note,
                status: 'failed'
            };
        } else {
            const uuid = $('div[data-ta="search-info"]').attr("data-ta-search-info-qid") || '';
            const ref_count = $('div[data-ta="search-info"]').attr("data-ta-search-info-count") || '';
            const rowText = $(".search-text").text().trim() || '';
            res = {
                uuid,
                ref_count,
                rowText,
                note,
                status: 'success'
            }
        }
        this.save(this.value, res);
        return res;
    }

    /** 
     * - 更新当前页面的 uuid 信息
    */
    async update() {
        let uuid = this.extract(window.location.href);
        // 更新 uuid 全局值
        if (uuid) {
            this.value = uuid;
        } else {
            console.warn('Failed to extract UUID from current page URL.');
            return null;
        }
        const res = await this.info();
        this.save(this.value, res);
    }

    /** */
    async open(uuid = '', sortBy = 'relevance', page_number = 1) {
        this.value = uuid;
        const href = `/wos/woscc/summary/${this.value}/${sortBy}/${page_number}`
        if (window.location.pathname !== href) {
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
            await asy_webFuncs.sleep(250);
            await asy_webWait.forElemBycssSelector('div[data-ta="search-info"]', 50);
        }
    }

    /** */
    async analyze_results(uuid = '') {
        this.value = uuid;
        // 再跳转到 analyze-results 页面
        const href = `/wos/woscc/analyze-results/${this.value}`
        if (window.location.pathname !== href) {
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
            await asy_webFuncs.sleep(250);
        }
    }

    /** */
    async citation_report(uuid = '') {
        this.value = uuid;
        // 再跳转到 analyze-results 页面
        const href = `/wos/woscc/citation-report/${this.value}`;
        if (window.location.pathname !== href) {
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
            await asy_webFuncs.sleep(250);
        }
    }

    get refine_typ() {
        return {
            PY: 'See all Publication Years',
            DT: 'See all Document Types',
            DX2NG: 'See all Researcher Profiles',
            TASCA: 'See all Web of Science Categories',
            TMSO: 'See all Citation Topics Meso',
            TMIC: "See all Citation Topics Micro",
            SDG: "See all Sustainable Development Goals",
            EDN: "See all Web of Science Index",
            OG: 'See all Affiliations',
            DLM: "See all Affiliation with Department",
            SO: "See all Publication Titles",
            LA: "See all Languages",
            CU: 'See all Countries/Regions',
            PUBL: "See all Publishers",
            SJ: "See all Research Areas",
            FO: "See all Funding Agencies",
            CF: "See all Conference Titles",
        };
    }

    /**
     *  构造 export_refine 的请求体 
     * 
    */
    #refineParameters(fields = ['OG'], maxRows = [100]) {
        const s = [
            {
                // 'See all Publication Years'
                "Field": {
                    "Name": "PY",
                    "SortType": "Field",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Document Types'
                "Field": {
                    "Name": "DT",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Researcher Profiles'
                "Field": {
                    "Name": "DX2NG",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Web of Science Categories'
                "Field": {
                    "Name": "TASCA",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Citation Topics Meso'
                "Field": {
                    "Name": "TMSO",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Citation Topics Micro"
                "Field": {
                    "Name": "TMIC",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                //"See all Sustainable Development Goals"
                "Field": {
                    "Name": "SDG",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Web of Science Index"
                "Field": {
                    "Name": "EDN",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Affiliations'
                "Field": {
                    "Name": "OG",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 300,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Affiliation with Department"
                "Field": {
                    "Name": "DLM",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 300,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Publication Titles"
                "Field": {
                    "Name": "SO",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Languages"
                "Field": {
                    "Name": "LA",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // 'See all Countries/Regions'
                "Field": {
                    "Name": "CU",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Publishers"
                "Field": {
                    "Name": "PUBL",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Research Areas"
                "Field": {
                    "Name": "SJ",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // "See all Open Access Journals"
                "Field": {
                    "Name": "OAJ",
                    "SortType": "IS",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // Filter by Marked List 
                "Field": {
                    "Name": "LIST",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // Funding Agencies 
                "Field": {
                    "Name": "FO",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // Conference Titles 
                "Field": {
                    "Name": "CF",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // Group Authors
                "Field": {
                    "Name": "GP",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                //  Book Series Titles 
                "Field": {
                    "Name": "SE",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            },
            {
                // Editors
                "Field": {
                    "Name": "ED",
                    "SortType": "Value",
                    "Threshold": 1,
                    "MaxRows": 100,
                    "Sort": "D",
                    "Language": "en"
                }
            }
        ]
        if (!Array.isArray(fields)) {
            // 返回所有默认参数集
            return s
        }
        const res = [];
        for (const f of fields) {
            const item = s.find(i => i.Field.Name === f);
            if (item) {
                if (Array.isArray(maxRows)) {
                    const idx = fields.indexOf(f);
                    if (idx >= 0 && maxRows[idx]) {
                        item.Field.MaxRows = maxRows[idx];
                    }
                }
                res.push(item);
            }
        }
        return res;
    }

    /**
     * 需要手工打开 uuid page后运行的方法
     - fileds = 'all'
     - fibers = ['OG','CU']
     */
    async current_page_refine(fileds = 'all', maxRows = [100]) {
        // 更新 uuid 全局值
        const uuid = this.extract(window.location.href);
        if (!this.valid(uuid)) {
            console.warn('Failed to extract UUID from current page URL.');
            return null;
        }
        this.value = uuid;
        // 构造请求体
        const josndata = {
            "retrieve": {
                "Options": {
                    "DataFormat": "Map",
                    "ReturnType": "List",
                    "View": "SiloSummaryAbstractSubset"
                },
                "FirstRecord": 1,
                "AnalyzeParameters": this.#refineParameters(fileds, maxRows),
                "Count": 0
            },
            "id": uuid
        };
        try {
            const response = await fetch('/api/esti/SearchEngine/retrieve', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'accept-language': 'en,zh-TW;q=0.9,zh;q=0.8',
                    'cache-control': 'no-cache',
                    'content-type': 'text/plain;charset=UTF-8',
                    'origin': window.location.origin,
                    'pragma': 'no-cache',
                    'priority': 'u=1, i',
                    'referer': window.location.href,
                    'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                    'sec-ch-ua-arch': '"arm"',
                    'sec-ch-ua-bitness': '"64"',
                    'sec-ch-ua-full-version': '"142.0.7444.176"',
                    'sec-ch-ua-full-version-list': '"Chromium";v="142.0.7444.176", "Google Chrome";v="142.0.7444.176", "Not_A Brand";v="99.0.0.0"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-model': '""',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-ch-ua-platform-version': '"26.2.0"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                    'x-1p-wos-sid': window.sessionData.BasicProperties.SID,
                    'cookie': window.document.cookie
                },
                body: JSON.stringify(josndata)
            });
            if (!response.ok) {
                console.error(`Request failed for uuid: ${this.value} \n Status: ${response.status}`);
                return null;
            }
            const json = await response.json();

            // 保存数据到本地缓存
            const uuid = json.QueryResult.QueryID;
            for (const field of Object.values(json.Data.AnalyzeResults || {})) {
                if (this.db[uuid] && this.db[uuid][field.Name]) {
                    // 有存在相同的就先删除
                    delete this.db[uuid][field.Name]
                }
                this.save([uuid], { [field.Name]: field.Values });
            }
            return json;
        } catch (e) {
            console.error('Error during fetch in req_find:', e);
        }


    }

    /**
     * - 获取当前页面的所有 wosid 列表,会自动保存到 db 中
    */
    async current_page_all_wosids() {
        this.#goto_page(1);
        let uuid = this.extract(window.location.href);
        // 更新 uuid 全局值
        if (uuid) {
            this.value = uuid;
        } else {
            console.warn('Failed to extract UUID from current page URL.');
            return null;
        }

        let res = [];
        const max_num = $(".end-page.ng-star-inserted").eq(0).text().trim() || '1';
        for (let n = 1; n <= parseInt(max_num); n++) {
            await this.#goto_next_page();
            //执行的每次都会增量保存
            await this.current_page_wosids();
        }
    }

    /** 
     - 获取当前页面的所有 wosid 列表,会自动保存到 db 中
    */
    async current_page_wosids() {
        let uuid = this.extract(window.location.href);
        // 更新 uuid 全局值
        if (uuid) {
            this.value = uuid;
        } else {
            console.warn('Failed to extract UUID from current page URL.');
            return null;
        }

        await asy_webFuncs.autoScroll();
        const $links = $('.summary-record');
        let res = [];
        $links.each(function () {
            let href = $(this).find('app-summary-title a').attr('href')
            if (href) {
                href = href.split('/').pop();
            } else {
                return;
            }
            let citations_count = $(this).find('a[data-ta="stat-number-citation-related-count"]')
            if (citations_count.length > 0) {
                citations_count = citations_count.text().trim();
            } else {
                citations_count = '0';
            }
            let ref_count = $(this).find('a[data-ta="stat-number-references-count"]')
            if (ref_count.length > 0) {
                ref_count = ref_count.text().trim();
            } else {
                ref_count = '0';
            }
            // related count
            let related_count = $(this).find('a[data-ta="sharedRef-records-link"]')
            if (related_count.length > 0) {
                related_count = related_count.text().trim();
            } else {
                related_count = '0';
            }

            res.push({
                wosid: href,
                citations_count,
                related_count,
                ref_count
            });
        });
        this.save(uuid, { page_wosids: res });
    }

    async #goto_page(n = 1) {
        const max_num = $(".end-page.ng-star-inserted").eq(0).text().trim() || '1';
        if (n > max_num) {
            n = max_num;
            console.log(`exceeded max page number, adjusted to max page number: ${max_num}`);
            return false;
        }
        // 判断当前是否已经在 uuid 页面
        if (window.location.pathname.startsWith("/wos/woscc/summary/")) {
            const href = window.location.pathname.split("/").slice(0, -1).concat(n).join("/")
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
            await asy_webWait.forElemBycssSelector("app-summary-title", 50)
            return true;
        }
    }

    async #goto_next_page() {
        $('button[cdxanalyticscategory="wos_navigation_next_page"]')[0].click()
        await asy_webWait.forElemBycssSelector("app-summary-title", 50)
    }

    async #goto_previous_page() {
        $('button[cdxanalyticscategory="wos_navigation_previous_page"]')[0].click()
        await asy_webWait.forElemBycssSelector("app-summary-title", 50)
    }

    async #export_ext(uuid = '', markFrom = 1, markTo = 2, fieldList = 'fullRecord') {
        const jsondata = {
            "action": "saveToFieldTagged",
            "colName": "WOS",
            "displayTimesCited": "true",
            "displayUsageInfo": "true",
            "displayCitedRefs": "true",
            "filters": fieldList,
            "fileOpt": "othersoftware",
            "locale": "en_US",
            "parentQid": uuid,
            "sortBy": "relevance",
            "product": "UA",
            "markFrom": `${markFrom}`,
            "markTo": `${markTo}`,
            "view": "summary",
            "isRefQuery": "false",
        }
        // 发送请求
        try {
            const response = await fetch('/api/wosnx/indic/export/saveToFile', {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en,zh-TW;q=0.9,zh;q=0.8',
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                    'origin': window.location.origin,
                    'pragma': 'no-cache',
                    'priority': 'u=1, i',
                    'referer': window.location.href + "(overlay:export/ext)",
                    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                    'x-1p-wos-sid': window.sessionData.BasicProperties.SID,
                    'cookie': document.cookie
                },
                body: JSON.stringify(jsondata)
            });

            if (!response.ok) {
                console.error(`request failed:uuid: ${uuid} \n status code: ${response.status}`);
                return null;
            }
            const text = await response.text();
            console.log(`fetch records from ${markFrom} to ${markTo} for UUID: ${uuid}`);
            return text
        } catch (e) {
            return null;
        }
    }

    async #export_bib(uuid = '', markFrom = 1, markTo = 2, filters = 'authorTitleSource') {
        const jsondata = {
            "parentQid": uuid,
            "sortBy": "relevance",
            "displayTimesCited": "true",
            "displayCitedRefs": "true",
            "product": "UA",
            "colName": "WOS",
            "displayUsageInfo": "true",
            "fileOpt": "othersoftware",
            "action": "saveToBibtex",
            "markFrom": `${markFrom}`,
            "markTo": `${markTo}`,
            "view": "summary",
            "isRefQuery": "false",
            "locale": "en_US",
            "filters": filters
        };
        try {
            const response = await fetch('/api/wosnx/indic/export/saveToFile', {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'en,zh-TW;q=0.9,zh;q=0.8',
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                    'origin': window.location.origin,
                    'pragma': 'no-cache',
                    'priority': 'u=1, i',
                    'referer': window.location.href + "(overlay:export/exbt)",
                    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                    'x-1p-wos-sid': window.sessionData.BasicProperties.SID,
                    'cookie': document.cookie
                },
                body: JSON.stringify(jsondata)
            });

            if (!response.ok) {
                console.error(`bib export failed:uuid: ${uuid} \n status code: ${response.status}`);
                return null;
            }
            const text = await response.text();
            console.log(`fetch bib records from ${markFrom} to ${markTo} for UUID: ${uuid}`);
            return text;
        } catch (e) {
            return null;
        }
    }

    /**
      - 后台请求的方式, 批量导出指定范围的文献记录 保存为本地txt文件
      - authorTitleSource
      - authorTitleSourceAbstract
      - fullRecord
      */
    async export_batchSize_toTxt(markFrom = 1, markTo = 0, batchSize = 200, onProgress = null) {
        const fieldList = 'fullRecord'
        const emitProgress = (payload = {}) => {
            if (typeof onProgress !== 'function') return;
            try {
                onProgress(payload);
            } catch (error) {
                console.warn('[WOS] export_auto500_txt progress callback failed:', error);
            }
        };

        // 先跳转到 uuid 页面
        const res = await this.info();
        if (!res) {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }
        const uuid = res.uuid;
        this.value = uuid;

        if (!res || res.status === 'failed') {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }

        const max_ref_count = parseInt(res.ref_count);
        // 再跳转到 export 页面
        if (markTo == 0) {
            markTo = max_ref_count;
        } else if (markTo > max_ref_count) {
            markTo = max_ref_count;
        }
        console.log(`Starting download task: \nUUID: ${this.value} \nRecords: ${markFrom} to ${markTo}, Type: ${fieldList} \nbatch size: 500`);
        // 分批下载     
        let current = markFrom;
        const totalRecords = Math.max(markTo - markFrom + 1, 0);
        const totalBatches = totalRecords > 0 ? Math.ceil(totalRecords / batchSize) : 0;
        let completedBatches = 0;

        emitProgress({
            phase: 'start',
            uuid: this.value,
            markFrom,
            markTo,
            fieldList,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches
        });

        while (current <= markTo) {
            const batchEnd = Math.min(current + batchSize - 1, markTo);
            const temp = await this.#export_ext(
                uuid,
                current,
                batchEnd,
                fieldList,
            );
            if (temp === null) {
                const message = `Export request failed for records ${current}-${batchEnd}.`;
                console.error(message);
                emitProgress({
                    phase: 'error',
                    uuid: this.value,
                    message,
                    current,
                    batchEnd,
                    completedBatches,
                    totalBatches
                });
                throw new Error(message);
            }

            const filename = `${this.value}_${current}_${batchEnd}`;
            await asy_webFuncs.saveTextToFile(temp, filename);
            completedBatches += 1;
            emitProgress({
                phase: 'batch',
                uuid: this.value,
                fieldList,
                batchSize,
                totalRecords,
                totalBatches,
                completedBatches,
                current,
                batchEnd,
                filename: `${filename}.txt`
            });
            current = batchEnd + 1;
        }

        emitProgress({
            phase: 'complete',
            uuid: this.value,
            fieldList,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches
        });
        return {
            status: 'completed',
            uuid: this.value,
            totalRecords,
            totalBatches,
            completedBatches
        };
    }

    /**
      - 后台请求的方式, 批量导出指定范围的文献记录 保存为本地bib文件
      - filters:
      - authorTitleSource
      - authorTitleSourceAbstract
      */
    async export_batchSize_toBib(markFrom = 1, markTo = 0, batchSize = 200, onProgress = null) {
        const filters = 'authorTitleSource';
        const emitProgress = (payload = {}) => {
            if (typeof onProgress !== 'function') return;
            try {
                onProgress(payload);
            } catch (error) {
                console.warn('[WOS] export_batchSize_toBib progress callback failed:', error);
            }
        };

        const res = await this.info();
        if (!res) {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }
        const uuid = res.uuid;
        this.value = uuid;

        if (!res || res.status === 'failed') {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }

        const max_ref_count = parseInt(res.ref_count);
        if (markTo == 0) {
            markTo = max_ref_count;
        } else if (markTo > max_ref_count) {
            markTo = max_ref_count;
        }
        console.log(`Starting bib download task: \nUUID: ${this.value} \nRecords: ${markFrom} to ${markTo}, Filters: ${filters} \nbatch size: ${batchSize}`);

        let current = markFrom;
        const totalRecords = Math.max(markTo - markFrom + 1, 0);
        const totalBatches = totalRecords > 0 ? Math.ceil(totalRecords / batchSize) : 0;
        let completedBatches = 0;

        emitProgress({
            phase: 'start',
            uuid: this.value,
            markFrom,
            markTo,
            filters,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches
        });

        while (current <= markTo) {
            const batchEnd = Math.min(current + batchSize - 1, markTo);
            const temp = await this.#export_bib(
                uuid,
                current,
                batchEnd,
                filters,
            );
            if (temp === null) {
                const message = `Bib export request failed for records ${current}-${batchEnd}.`;
                console.error(message);
                emitProgress({
                    phase: 'error',
                    uuid: this.value,
                    message,
                    current,
                    batchEnd,
                    completedBatches,
                    totalBatches
                });
                throw new Error(message);
            }

            const filename = `${this.value}_${current}_${batchEnd}`;
            await asy_webFuncs.saveTextToFile(temp, filename, 'bib');
            completedBatches += 1;
            emitProgress({
                phase: 'batch',
                uuid: this.value,
                filters,
                batchSize,
                totalRecords,
                totalBatches,
                completedBatches,
                current,
                batchEnd,
                filename: `${filename}.bib`
            });
            current = batchEnd + 1;
        }

        emitProgress({
            phase: 'complete',
            uuid: this.value,
            filters,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches
        });
        return {
            status: 'completed',
            uuid: this.value,
            totalRecords,
            totalBatches,
            completedBatches
        };
    }

    /**
    - 后台请求的方式, 将拿到结果保存为数组
    - authorTitleSource
    - authorTitleSourceAbstract
    - fullRecord
    */
    async export_batchSize(markFrom = 1, markTo = 0, batchSize = 200, onProgress = null) {
        const fieldList = 'fullRecord';
        const resultArray = [];
        const emitProgress = (payload = {}) => {
            if (typeof onProgress !== 'function') return;
            try {
                onProgress(payload);
            } catch (error) {
                console.warn('[WOS] export_pre_num progress callback failed:', error);
            }
        };

        // 先跳转到 uuid 页面
        const res = await this.info();
        if (!res) {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }
        const uuid = res.uuid;
        this.value = uuid;

        if (!res || res.status === 'failed') {
            console.error('Failed to retrieve UUID information.');
            emitProgress({ phase: 'error', message: 'Failed to retrieve UUID information.' });
            return null;
        }

        const max_ref_count = parseInt(res.ref_count);
        // 再跳转到 export 页面
        if (markTo == 0) {
            markTo = max_ref_count;
        } else if (markTo > max_ref_count) {
            markTo = max_ref_count;
        }
        console.log(`Starting download task: \nUUID: ${this.value} \nRecords: ${markFrom} to ${markTo}, Type: ${fieldList} \nbatch size: ${batchSize}`);
        // 分批下载     
        let current = markFrom;
        const totalRecords = Math.max(markTo - markFrom + 1, 0);
        const totalBatches = totalRecords > 0 ? Math.ceil(totalRecords / batchSize) : 0;
        let completedBatches = 0;

        emitProgress({
            phase: 'start',
            uuid: this.value,
            markFrom,
            markTo,
            fieldList,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches
        });

        while (current <= markTo) {
            const batchEnd = Math.min(current + batchSize - 1, markTo);
            const temp = await this.#export_ext(
                uuid,
                current,
                batchEnd,
                fieldList,
            );
            if (temp === null) {
                const message = `Export request failed for records ${current}-${batchEnd}.`;
                console.error(message);
                emitProgress({
                    phase: 'error',
                    uuid: this.value,
                    message,
                    current,
                    batchEnd,
                    completedBatches,
                    totalBatches
                });
                throw new Error(message);
            }

            resultArray.push(temp);
            completedBatches += 1;
            emitProgress({
                phase: 'batch',
                uuid: this.value,
                fieldList,
                batchSize,
                totalRecords,
                totalBatches,
                completedBatches,
                current,
                batchEnd,
                resultLength: resultArray.length
            });
            current = batchEnd + 1;
        }

        emitProgress({
            phase: 'complete',
            uuid: this.value,
            fieldList,
            batchSize,
            totalRecords,
            totalBatches,
            completedBatches,
            resultLength: resultArray.length
        });
        return {
            status: 'completed',
            uuid: this.value,
            totalRecords,
            totalBatches,
            completedBatches,
            data: resultArray
        };
    }


    async export_pre_200(markFrom = 1, markTo = 0, batchSize = 200, onProgress = null) {
        await this.export_pre_num(markFrom, markTo, batchSize, onProgress);
    }

    /** 
     - 下载指定范围的文献记录,前端操作的方式
     */
    async #download_exc(from = 1, to = 0, recordContent = 'Full Record') {
        // core code here
        const href = `${window.location.pathname}(overlay:export/exc)`
        if (window.location.pathname !== href) {
            window.history.pushState({}, "", href);
            window.dispatchEvent(new Event("popstate"));
        }
        await asy_webWait.forElemBycssSelector("#exportButton", 50);
        $("#radio3-input").click()
        await asy_webWait.forElemBycssSelector('[id*="mat-input"][name="markFrom"]', 50);

        //处理设置 开始值
        const $elF = $('[id*="mat-input"][name="markFrom"]');
        $elF.val(from);
        $elF[0].dispatchEvent(new Event('input', { bubbles: true }));
        //处理设置 结束值
        const $elTo = $('[id*="mat-input"][name="markTo"]');
        $elTo.val(to);
        $elTo[0].dispatchEvent(new Event('input', { bubbles: true }));

        $('.margin-top-5.ng-star-inserted > .mat-mdc-tooltip-trigger.dropdown.mat-mdc-tooltip-disabled.ng-star-inserted')
            .trigger('mousedown')
            .trigger('mouseup')
            .trigger('click');
        await asy_webFuncs.sleep(100);
        $(`.options.options-menu div[title="${recordContent}"]`)
            .trigger('mousedown')
            .trigger('mouseup')
            .trigger('click');
        await asy_webFuncs.sleep(100);
        $("#exportButton").click()
        await asy_webWait.forElemDisplayBycssSelector("#exportButton", 100);
    }

    async download(markFrom = 1, markTo = 0, filter = 'FULL') {
        const res = await this.info();
        if (!res) {
            console.error('Failed to retrieve UUID information.');
            return null;
        }
        const uuid = res.uuid;
        this.value = uuid;

        if (!res || res.status === 'failed') {
            console.error('Failed to retrieve UUID information.');
            return null;
        }

        const max_ref_count = parseInt(res.ref_count);
        // 再跳转到 export 页面
        if (markTo == 0) {
            markTo = max_ref_count;
        } else if (markTo > max_ref_count) {
            markTo = max_ref_count;
        }

        const typ = {
            "ATS": 'Author, Title, Source',
            "ATSA": 'Author, Title, Source, Abstract',
            'FULL': 'Full Record',
            'UT': "ACCESSION_NUM"
        }
        const recordContent = typ[filter] || 'Full Record';

        console.log(`Starting download task: \nUUID: ${this.value} \nRecords: ${markFrom} to ${markTo}, recordContent: ${recordContent} \nbatch size: 500`);
        // 分批下载     
        const batchSize = 500;
        let current = markFrom;
        while (current <= markTo) {
            const batchEnd = Math.min(current + batchSize - 1, markTo);
            await this.#download_exc(
                current,
                batchEnd,
                recordContent
            );
            current = batchEnd + 1;
        }
    }

}
const asy_uuid = new WosUUID();




























































class WosJCR {
    static instance = null;
    static def_value = '71bc6d46-a5e5-40b3-abd6-79f92952b7fe-01896f03a6';
    constructor() {
        if (WosJCR.instance) return WosJCR.instance;
        WosJCR.instance = this;
    }

    /**
     * cookies 字符转 JSON 
     */
    #cookieStr_to_json(cookieStr) {
        const obj = {};
        cookieStr.split(";").forEach(pair => {
            let [key, value] = pair.split("=");
            if (!key) return;

            key = key.trim();
            value = (value || "").trim();

            obj[key] = value;
        });
        return obj;
    }

    // 单次收集
    async fetch_JCR(start = 1) {
        const url = 'https://jcr.clarivate.com/api/jcr3/bwjournal/v1/search-result';

        const pssid = this.#cookieStr_to_json(window.document.cookie).PSSID;
        if (!pssid) {
            console.error("PSSID cookie not found.");
            return;
        }

        const body = {
            journalFilterParameters: {
                query: "",
                journals: [],
                categories: [],
                publishers: [],
                countryRegions: [],
                citationIndexes: ["SCIE", "SSCI", "AHCI", "ESCI"],
                jcrYear: 2024,
                categorySchema: "WOS",
                openAccess: "N",
                jifQuartiles: [],
                jifRanges: [],
                jifNA: false,
                jifPercentileRanges: [],
                jciRanges: [],
                oaRanges: [],
                issnJ20s: []
            },
            retrievalParameters: {
                start,
                count: 600,
                sortBy: "jci",
                sortOrder: "DESC"
            }
        };

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "origin": "https://jcr.clarivate.com",
                "referer": "https://jcr.clarivate.com/jcr/browse-journals",
                "user-agent": navigator.userAgent,
                "x-1p-inc-sid": pssid
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        console.log("JCR fetch result: ", data?.data?.length || 0, "records");
        return data;
    }

    // 拿到总记录数
    async fetch_JCR_total_counts() {
        const initialRes = await this.fetch_JCR(1);
        if (!initialRes || !initialRes.totalCount) {
            console.error("Failed to fetch total count.");
            return [];
        }
        const totalCount = initialRes.totalCount;
        // console.log(`Total count: ${totalCount}`);
        return totalCount;
    }

    //批量收集, 每次200条
    async export(totalCount = 0) {
        if (totalCount === 0) {
            totalCount = await this.fetch_JCR_total_counts();
            if (totalCount === 0) {
                console.error("No records to fetch.");
                return [];
            }
        }
        // console.log(`Starting batch fetch for total count: ${totalCount}`);

        // let all_results = [];
        for (let start = 1; start <= totalCount; start += 600) {
            const res = await this.fetch_JCR(start);
            await asy_webFuncs.sleep(10000); // 避免请求过快
            if (res) {
                // all_results = all_results.concat(res.data || []);
                asy_webFuncs.saveToFile(res.data, `JCR_${start}_${Math.min(start + 599, totalCount)}`);
            }
        }
    }

    /** 
     - 将所有 jcr 的json文件放在一个文件夹处,使用这个方法转为csv
    */
    merge_json_to_csv() {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;

        input.onchange = async (e) => {
            const files = Array.from(e.target.files || []);
            const jsonFiles = files.filter(f => f.name.toLowerCase().startsWith('jcr_') && f.name.toLowerCase().endsWith('.json'));

            if (jsonFiles.length === 0) {
                alert('No JSON files found in the selected folder');
                return;
            }

            console.log(`Found ${jsonFiles.length} JSON files`);
            console.log('Processing files... (large output suppressed)');
            const readFileAsText = (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsText(file, 'utf-8');
                });
            };

            const allRows = [];
            const allKeys = new Set();

            // ---- 核心：将一个对象展开为多行（针对数组字段） ----
            function expandObjectToRows(obj, extra = {}) {
                // 基础对象 + 文件名等额外信息
                const base = { ...extra, ...obj };

                // 收集需要展开的 “数组字段”（数组里是对象）
                const arrayObjectKeys = [];
                for (const [k, v] of Object.entries(base)) {
                    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
                        arrayObjectKeys.push(k);
                    }
                }

                // 没有数组对象字段，就直接扁平化成一行
                if (arrayObjectKeys.length === 0) {
                    return [flattenObject(base)];
                }

                // 有数组对象字段：做笛卡尔展开
                // 先把这些字段从 base 里删掉，避免重复
                const baseWithoutArrays = { ...base };
                arrayObjectKeys.forEach(k => delete baseWithoutArrays[k]);

                // rows 从一个“只含基础字段”的对象开始
                let rows = [baseWithoutArrays];

                // 依次展开每个数组字段
                for (const key of arrayObjectKeys) {
                    const arr = obj[key];
                    const newRows = [];
                    for (const row of rows) {
                        for (const item of arr) {
                            // 每个 item 可能还有嵌套，这里先简单合并，后面 flattenObject 再递归扁平
                            newRows.push({ ...row, [key]: item });
                        }
                    }
                    rows = newRows;
                }

                // 把每个 row 做一次扁平化
                return rows.map(r => flattenObject(r));
            }

            // ---- 扁平化对象：把嵌套对象变成 a.b.c 这种 key ----
            function flattenObject(obj, prefix = '', res = {}) {
                for (const [key, value] of Object.entries(obj)) {
                    const newKey = prefix ? `${prefix}.${key}` : key;

                    if (value === null || value === undefined) {
                        res[newKey] = '';
                    } else if (Array.isArray(value)) {
                        // 数组：如果是对象数组，本来应该在 expand 阶段处理，这里兜底用 JSON
                        if (value.length > 0 && typeof value[0] === 'object') {
                            res[newKey] = JSON.stringify(value);
                        } else {
                            // 普通值数组，用 ; 拼接
                            res[newKey] = value.join(';');
                        }
                    } else if (typeof value === 'object') {
                        // 嵌套对象，递归展开
                        flattenObject(value, newKey, res);
                    } else {
                        res[newKey] = value;
                    }
                }
                return res;
            }

            // ---- 逐个文件处理 ----
            for (const file of jsonFiles) {
                try {
                    const text = await readFileAsText(file);
                    let data = JSON.parse(text);

                    if (!Array.isArray(data)) {
                        data = [data];
                    }

                    for (const obj of data) {
                        // 展开一个期刊对象为多行
                        const rows = expandObjectToRows(obj, { __filename: file.name });
                        rows.forEach(r => {
                            allRows.push(r);
                            Object.keys(r).forEach(k => allKeys.add(k));
                        });
                    }

                    // console.log(`Read file: ${file.name}, generated rows: ${allRows.length}`);
                } catch (err) {
                    console.error(`Failed to parse file: ${file.name}`, err.message);
                }
            }

            if (allRows.length === 0) {
                alert('No valid data found after parsing all JSON files');
                return;
            }

            const headers = Array.from(allKeys);

            const escapeCsv = (value) => {
                if (value === null || value === undefined) return '';
                let s = String(value);
                if (/[",\n\r]/.test(s)) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            };

            const lines = [];
            lines.push(headers.map(escapeCsv).join(','));
            for (const row of allRows) {
                const line = headers.map(h => escapeCsv(row[h]));
                lines.push(line.join(','));
            }

            const csvContent = lines.join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'merged.json.expanded.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert(`完成！共 ${allRows.length} 行数据，已生成 merged.json.expanded.csv`);
        };

        input.click();
    }

}

const asy_wosJCR = new WosJCR();



























class WosQuery {
    static instance = null;
    static def_value = '71bc6d46-a5e5-40b3-abd6-79f92952b7fe-01896f03a6';
    constructor() {
        if (WosQuery.instance) return WosQuery.instance;
        WosQuery.instance = this;
        this._value = WosQuery.def_value;
        this.db = {}; // 本地缓存 uuid 数据
    }

    /**
     * - 从历史查询记录中查找对应的查询表达式
     */
    #innner_expr_query_from_history(text) {
        let result = null;
        $('app-history-search-entry').each(function () {
            const spanText = $(this).find('.query-details .query span span').text().toLowerCase().trim();

            if (spanText === text.toLowerCase().trim()) {
                const uuid = $(this).attr('data-hist-qid');

                let ref_count_text = $(this).find('a[data-ta="SearchHistory-records-count"]').text().trim();
                let ref_count = ref_count_text ? parseInt(ref_count_text.replace(/,/g, '')) : 0;

                result = {
                    uuid: uuid,
                    ref_count: ref_count
                };
                return false; // 停止 each 循环
            }
        });
        return result;
    }

    /**
     * 在输入框中设置值并触发输入事件,以模拟用户输入
     */
    #inner_setNativeValue(el, value) {
        const last = el.value;
        el.value = value;
        const event = new Event("input", { bubbles: true });
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue(last); // React 特有
        el.dispatchEvent(event);
    }

    /**
     - 检查是否已经在查询结果页面
     */
    async #checkIfQueryIsValid(expr) {
        if (window.location.pathname.startsWith("/wos/woscc/summary")) {
            // 判断当前搜索表达式是否匹配
            if ($(".search-text").length) {
                const _expr = $(".search-text").text().trim();
                if (_expr.toLowerCase() === expr.toLowerCase().trim()) {
                    return true;
                } else {
                    return false;
                }
            }
        }
        await asy_wosGoto.init_uuid_page();
        return false;
    }

    /**
     - 需要在高级搜索的网页中才能执行的方法
     */
    async query_builder(expr = 'PY=(2025)') {
        // 进入高级搜索页面
        await asy_wosGoto.adv_search_page();

        // 从历史查询中记录中获取
        const result = this.#innner_expr_query_from_history(expr);
        if (result) {
            // 如果找到历史记录，直接使用
            const uuid = result.uuid;
            const ref_count = result.ref_count;
            return {
                uuid: uuid,
                rowText: expr,
                ref_count: ref_count,
                status: 'success'
            };
        }

        // 设置搜索框内容
        const $input = $('#advancedSearchInputArea');
        if ($input.length) {
            $input.val(expr);
            $input.trigger('input');
            $input.trigger('change');
        }
        $input[0].dispatchEvent(new Event('input')); // 页面上的input监听器会响应

        const old_num = $("app-history-entries-list app-history-search-entry").length

        // 尝试找到 "add to history" 按钮
        let add_his = $('.mdc-button__label').filter(function () {
            return $(this).text().trim().toLowerCase().includes('add to history');
        });
        if (add_his.length === 0) {
            // 如果没有 "add to history"，执行 search
            const temp = $('.button-row.adv.ng-star-inserted .mdc-button__label').filter(function () {
                return $(this).text().trim().toLowerCase().includes('search');
            });
            if (temp.length) {
                temp.parent().find("mat-icon").click();
                await asy_webWait.forElemBycssSelector(".mat-mdc-menu-item-text span", 100);
                $(".mat-mdc-menu-item-text span").click();
                // 再次尝试获取 "add to history"

                await asy_webFuncs.sleep(500); // 等待2秒，确保结果加载完成
                add_his = $('.mdc-button__label').filter(function () {
                    return $(this).text().trim().toLowerCase().includes('add to history');
                });
            }
        }
        add_his.parent().click();

        // 2秒内, 检查是否有错误信息出现
        const search_error = await asy_webWait.forElemBycssSelector('.search-error.error-code.light-red-bg.ng-star-inserted', 20);
        if (search_error) {
            return {
                uuid: asy_webFuncs.random_uuid(),
                ref_count: 0,
                rowText: expr,
                status: 'failed',
                error_code: $('.search-error.error-code.light-red-bg.ng-star-inserted').text().trim() || 'unknown error',
            };
        }

        // 5秒内循环判断,这里是判断历史记录列表长度是否变化
        const changeDetected = await asy_webWait.forElemChangeBycssSelector("app-history-entries-list app-history-search-entry", old_num, 50);
        if (!changeDetected) {
            // console.error('查询未成功，可能是网络问题或页面结构变化');
            return {
                uuid: asy_webFuncs.random_uuid(),
                ref_count: 0,
                rowText: expr,
                status: 'failed',
                error_code: 'unknown error',
            };
        }

        // 等待查询结果加载完成#
        const $res = $('app-history-search-entry').first()
        let uuid = $res.attr('data-hist-qid');
        this.uuid_value = uuid;
        let ref_count = $res.find('a[data-ta="SearchHistory-records-count"]').first().text()
        if (!ref_count) {
            ref_count = 0
        } else {
            ref_count = parseInt(ref_count.replace(/,/g, ''));
        }
        return {
            uuid: uuid,
            ref_count,
            rowText: expr,
            status: 'success',
        }
    }

    /**
     - 需要在显示文献的网页中才能执行的方法
     */
    async old_query_page(expr = 'PY=(2025)') {
        // 进入 uuid 引用页面进行搜索
        if (await this.#checkIfQueryIsValid(expr)) {
            return true;
        }

        // 点击搜索框展开高级搜索输入区域
        if ($('#advancedSearchInputArea').length === 0 || !$('#advancedSearchInputArea').is(':visible')) {
            $('div[data-ta="search-terms"]').click();
            await asy_webWait.forElemBycssSelector("#advancedSearchInputArea", 50, 100);
        }
        // 特殊方法在输入框中输入内容
        this.#inner_setNativeValue($('#advancedSearchInputArea')[0], expr);
        await asy_webFuncs.sleep(300);
        // 执行搜索
        $('button[data-ta="run-search"]').click();
        await asy_webFuncs.sleep(200);

        // 6秒内 $(".search-error.error-code")长度大于0 或 $('button[data-ta="add-timespan-row"]') 长度为0
        for (let i = 0; i < 30; i++) {
            if ($(".search-error.error-code").length > 0) {
                return {
                    uuid: asy_webFuncs.random_uuid(),
                    ref_count: 0,
                    rowText: $("#advancedSearchInputArea").val().trim() || '',
                    status: 'failed',
                    error_code: $(".search-error.error-code").text().trim() || 'unknown error',
                };
            }
            await asy_webFuncs.sleep(200);
        }
        return false;
    }

    /** 
     - 新版方法
     */
    async query_page(rowText = 'PY=2025') {
        const query = [{
            rowText: rowText,
        }];
        const jsonStr = encodeURIComponent(JSON.stringify(query))
        const queryUrl = `/wos/woscc/general-summary?queryJson=${jsonStr}`;
        window.history.pushState({}, "", queryUrl);
        window.dispatchEvent(new Event("popstate"));

        await asy_webWait.forURL_change(50);
    }

    async query_wosids(wosid = []) {
        await this.query_page("UT=(" + wosid.join(" OR ") + ")");
    }

    // 输入一个 doi 数组构造查询并跳转到uuid页面
    async query_dois(dois = []) {
        await this.query_page("DO=(" + dois.join(" OR ") + ")");
    }

    /**
     * 从混合的 DOI 和 WOSID 列表中分离出各自的值
     */
    async query_wosid_or_doi(wosids = [], dois = []) {

        // 去重（使用 Set 确保完全去重）
        wosids = [...new Set(wosids)];
        dois = [...new Set(dois)];


        // 构建查询表达式
        let queryParts = [];

        if (wosids.length > 0) {
            queryParts.push(`UT=(${wosids.join(" OR ")})`);
        }

        if (dois.length > 0) {
            queryParts.push(`DO=(${dois.join(" OR ")})`);
        }

        // 如果有查询条件，通过 OR 拼接后执行
        if (queryParts.length > 0) {
            const queryText = queryParts.join(" OR ");
            await this.query_page(queryText);
        }

        return { wosids, dois };
    }




    /** 
     - 使用wos 内部自带的 搜索引擎解析查询语句并执行查询
     */
    async call_searchEngine_parse(text) {
        try {
            const response = await fetch('/api/esti/SearchEngine/parse', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'accept-language': 'en,zh-TW;q=0.9,zh;q=0.8',
                    'cache-control': 'no-cache',
                    'content-type': 'text/plain;charset=UTF-8',
                    'origin': window.location.origin,
                    'pragma': 'no-cache',
                    'priority': 'u=1, i',
                    'x-1p-wos-sid': window.sessionData.BasicProperties.SID,
                },
                body: JSON.stringify({
                    "userQuery": text,
                    "databaseID": "WOSCC",
                    "llmParse": false
                })
            });

            // 检查响应是否成功
            if (!response.ok) {
                console.error(`API request failed with status: ${response.status}`);
                return null;
            }

            // 尝试解析 JSON
            const data = await response.json();
            const rowText = data[0]?.query[0]?.rowText;
            if (rowText) {
                await asy_wosQuery.query_page(rowText);
            }
            return rowText;

        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            return null;
        }
    }








}
const asy_wosQuery = new WosQuery();




















// 统一api 
class WOS {
    static instance = null;
    constructor() {
        if (WOS.instance) return WOS.instance;
        WOS.instance = this;
        this.info = asy_wosInfo;
        this.goto = asy_wosGoto;
        this.uuid = asy_uuid;
        this.wosid = asy_wosid;
        this.jcr = asy_wosJCR;
        this.sharedRef_between = asy_wosid.sharedRef_between.bind(asy_wosid);
        this.query = asy_wosQuery.query_page.bind(asy_wosQuery);
        this.parse = asy_wosQuery.call_searchEngine_parse.bind(asy_wosQuery);
        this.query_wosid_or_doi = asy_wosQuery.query_wosid_or_doi.bind(asy_wosQuery);
        this.query_builder = asy_wosQuery.query_builder.bind(asy_wosQuery);
        this.startOneTrustAutoClose = asy_webFuncs.startOneTrustAutoClose.bind(asy_webFuncs);
        this.stopOneTrustAutoClose = asy_webFuncs.stopOneTrustAutoClose.bind(asy_webFuncs);
    }
}
const wos = new WOS();
const version = '0.0.25.12.4';
window.wos = wos;

if (!window.__WOS_ONETRUST_GUARD__) {
    window.__WOS_ONETRUST_GUARD__ = true;
    wos.startOneTrustAutoClose();
}

// Only log once on initial load (to minimize console history usage)
if (!window.__WOS_LOADED__) {
    console.log(`WOS API v${version} ready`);
    window.__WOS_LOADED__ = true;
}
