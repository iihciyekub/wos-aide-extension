// Content script loader for z-Wos.js
// This loads z-Wos.js into the page's main context (not isolated world)

(function() {
    // Only load on Web of Science domain
    const wosHostPattern = /(^|\.)(webofscience\.com|webofknowledge\.com|isiknowledge\.com)$/i;
    if (!wosHostPattern.test(window.location.hostname || '')) {
        return;
    }

    const injectScript = (src, onload) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = function() {
            if (onload) onload();
            this.remove();
        };
        script.onerror = function() {
            console.error(`Failed to load script: ${src}`);
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    };

    const injectWos = () => {
        injectScript(chrome.runtime.getURL('z-Wos.js'), () => {
            console.log('z-Wos.js loaded into page context');
        });
    };

    if (window.jQuery) {
        injectWos();
        return;
    }

    injectScript(chrome.runtime.getURL('jquery-3.7.0.js'), () => {
        console.log('jquery-3.7.0.js loaded into page context');
        injectWos();
    });
})();
