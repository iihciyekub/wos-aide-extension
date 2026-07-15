const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdaptiveConcurrentRunner,
    normalizeConcurrency,
    runConcurrentItems
} = require("../src/download-worker-pool");

test("normalizeConcurrency keeps the setting within the supported range", () => {
    assert.equal(normalizeConcurrency("1", 10), 1);
    assert.equal(normalizeConcurrency("2", 10), 2);
    assert.equal(normalizeConcurrency("0", 10), 1);
    assert.equal(normalizeConcurrency("99", 10), 10);
    assert.equal(normalizeConcurrency("invalid", 10), 1);
});

test("adaptive runner increases concurrency while the queue is active", async () => {
    let active = 0;
    let maximumActive = 0;
    let releaseFirstWave;
    const firstWave = new Promise(resolve => { releaseFirstWave = resolve; });

    const runner = createAdaptiveConcurrentRunner([1, 2, 3, 4], 1, async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (item <= 2) await firstWave;
        active -= 1;
        return false;
    });

    await Promise.resolve();
    runner.setConcurrency(2);
    await Promise.resolve();
    assert.equal(maximumActive, 2);
    releaseFirstWave();
    assert.equal(await runner.promise, false);
});

test("adaptive runner applies updated delay values between items", async () => {
    let delay = 10;
    const observedDelays = [];
    const runner = createAdaptiveConcurrentRunner([1, 2, 3], 1, async (item) => {
        if (item === 1) delay = 2;
        return false;
    }, async () => {
        observedDelays.push(delay);
        return false;
    });

    assert.equal(await runner.promise, false);
    assert.deepEqual(observedDelays, [2, 2]);
});

test("runConcurrentItems never exceeds the requested concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    const processed = [];

    await runConcurrentItems([1, 2, 3, 4, 5, 6], 2, async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        processed.push(item);
        active -= 1;
        return false;
    });

    assert.equal(maximumActive, 2);
    assert.deepEqual(processed.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test("runConcurrentItems uses one worker when concurrency is one", async () => {
    const events = [];

    await runConcurrentItems(["a", "b", "c"], 1, async (item) => {
        events.push(`start:${item}`);
        await Promise.resolve();
        events.push(`end:${item}`);
        return false;
    });

    assert.deepEqual(events, [
        "start:a", "end:a",
        "start:b", "end:b",
        "start:c", "end:c"
    ]);
});

test("runConcurrentItems stops workers without claiming the remaining queue", async () => {
    const processed = [];

    const results = await runConcurrentItems([1, 2, 3, 4, 5], 2, async (item) => {
        processed.push(item);
        return item <= 2;
    });

    assert.deepEqual(processed, [1, 2]);
    assert.deepEqual(results, [true, true]);
});
