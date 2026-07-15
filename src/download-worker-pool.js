function normalizeConcurrency(value, maximum = 10, fallback = 1) {
    const parsed = String(value ?? "").trim() === "" ? NaN : Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(1, parsed));
}

async function runConcurrentItems(items, concurrency, processItem, waitBetweenItems = async () => false) {
    let nextIndex = 0;

    const claimNext = () => {
        if (nextIndex >= items.length) return null;
        const index = nextIndex;
        nextIndex += 1;
        return { item: items[index], index };
    };

    const runWorker = async () => {
        let entry = claimNext();
        while (entry) {
            if (await processItem(entry.item, entry.index)) return true;
            entry = claimNext();
            if (entry && await waitBetweenItems()) return true;
        }
        return false;
    };

    const workerCount = Math.min(normalizeConcurrency(concurrency), items.length);
    if (workerCount === 0) return [];
    return Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

function createAdaptiveConcurrentRunner(items, initialConcurrency, processItem, waitBetweenItems = async () => false) {
    let nextIndex = 0;
    let activeWorkers = 0;
    let retiringWorkers = 0;
    let targetConcurrency = normalizeConcurrency(initialConcurrency);
    let stopped = false;
    let settled = false;
    let resolvePromise;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    const finishIfDone = () => {
        if (settled || activeWorkers > 0) return;
        if (stopped || nextIndex >= items.length) {
            settled = true;
            resolvePromise(stopped);
        }
    };

    const runWorker = async () => {
        while (!stopped) {
            if (activeWorkers - retiringWorkers > targetConcurrency) {
                retiringWorkers += 1;
                return "retired";
            }
            if (nextIndex >= items.length) return "done";

            const index = nextIndex;
            nextIndex += 1;
            if (await processItem(items[index], index)) return "stopped";

            if (nextIndex < items.length && await waitBetweenItems()) return "stopped";
        }
        return "stopped";
    };

    const launchWorkers = () => {
        if (settled || stopped) {
            finishIfDone();
            return;
        }
        while (activeWorkers < targetConcurrency && nextIndex < items.length) {
            activeWorkers += 1;
            runWorker().then((result) => {
                if (result === "retired") retiringWorkers -= 1;
                if (result === "stopped") stopped = true;
                activeWorkers -= 1;
                launchWorkers();
                finishIfDone();
            }).catch((error) => {
                if (settled) return;
                settled = true;
                stopped = true;
                rejectPromise(error);
            });
        }
        finishIfDone();
    };

    launchWorkers();

    return {
        promise,
        setConcurrency(value) {
            targetConcurrency = normalizeConcurrency(value);
            launchWorkers();
        }
    };
}

module.exports = {
    normalizeConcurrency,
    runConcurrentItems,
    createAdaptiveConcurrentRunner
};
