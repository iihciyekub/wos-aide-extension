const test = require("node:test");
const assert = require("node:assert/strict");

const {
    directoryLockName,
    projectHandleKeyForTab,
    runWithWebLock
} = require("../src/pdf-tab-directory");

test("PDF directory handles use a distinct IndexedDB key for each tab", () => {
    assert.equal(projectHandleKeyForTab(101), "pdf-download-tab:101");
    assert.equal(projectHandleKeyForTab(102), "pdf-download-tab:102");
    assert.notEqual(projectHandleKeyForTab(101), projectHandleKeyForTab(102));
});

test("PDF index locks match for the same directory and scope", () => {
    assert.equal(
        directoryLockName("Accounting Forum", "index"),
        directoryLockName("Accounting Forum", "index")
    );
    assert.notEqual(
        directoryLockName("Accounting Forum", "index"),
        directoryLockName("Marketing Science", "index")
    );
    assert.notEqual(
        directoryLockName("Accounting Forum", "index"),
        directoryLockName("Accounting Forum", "file:paper.pdf")
    );
});

test("Web Lock acquisition failure falls back without losing the task", async () => {
    let taskRuns = 0;
    let reportedError = null;
    const lockManager = {
        request: async () => { throw new Error("locks unavailable"); }
    };

    const result = await runWithWebLock(lockManager, "test-lock", async () => {
        taskRuns += 1;
        return "saved";
    }, error => { reportedError = error; });

    assert.equal(result, "saved");
    assert.equal(taskRuns, 1);
    assert.equal(reportedError?.message, "locks unavailable");
});

test("Web Lock does not rerun a protected task that throws", async () => {
    let taskRuns = 0;
    const lockManager = {
        request: async (_name, _options, callback) => callback()
    };

    await assert.rejects(
        runWithWebLock(lockManager, "test-lock", async () => {
            taskRuns += 1;
            throw new Error("write failed");
        }),
        /write failed/
    );
    assert.equal(taskRuns, 1);
});
