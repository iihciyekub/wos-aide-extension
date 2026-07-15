const normalizePart = (value, fallback) => {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
};

const projectHandleKeyForTab = (tabContextId) =>
    `pdf-download-tab:${normalizePart(tabContextId, "unknown")}`;

const directoryLockName = (directoryName, scope = "index") => {
    const directory = encodeURIComponent(normalizePart(directoryName, "unnamed-folder"));
    const lockScope = encodeURIComponent(normalizePart(scope, "index"));
    return `wos-aide-pdf:${directory}:${lockScope}`;
};

const runWithWebLock = async (lockManager, lockName, task, onUnavailable = () => {}) => {
    if (!lockManager?.request) return task();

    let taskStarted = false;
    try {
        return await lockManager.request(lockName, { mode: "exclusive" }, async () => {
            taskStarted = true;
            return task();
        });
    } catch (error) {
        // Only fall back when lock acquisition itself failed. If the protected task
        // threw, rethrow it so a file/index write is never attempted twice.
        if (taskStarted) throw error;
        onUnavailable(error);
        return task();
    }
};

module.exports = {
    directoryLockName,
    projectHandleKeyForTab,
    runWithWebLock
};
