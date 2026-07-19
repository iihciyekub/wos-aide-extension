// Content script loader for z-Wos.js
// This loads z-Wos.js into the page's main context (not isolated world)

const { isWosLocation } = require('./wos-host');

(function() {
    // Only load on Web of Science domain
    if (
        globalThis.__WOS_AIDE_PROXY_HOST__ !== true
        && !isWosLocation(window.location.hostname, window.location.href)
    ) {
        return;
    }

    chrome.runtime.sendMessage({
        type: 'INJECT_MAIN_WORLD_FILES',
        files: ['jquery-3.7.0.js', 'z-Wos.js']
    }, response => {
        if (chrome.runtime.lastError || !response?.success) {
            console.error(
                'Failed to load WOS page scripts:',
                chrome.runtime.lastError?.message || response?.error || 'unknown error'
            );
            return;
        }
        console.log('WOS page scripts loaded into MAIN world');
    });
})();
