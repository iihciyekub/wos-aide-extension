const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("PDF downloader never falls back to the browser Downloads folder", () => {
    const source = fs.readFileSync(
        path.join(__dirname, "../src/z-doi-pdf-download.js"),
        "utf8"
    );

    assert.doesNotMatch(source, /createElement\(["']a["']\)/);
    assert.match(source, /download_pdf\(doi, template, signal, dirHandle\)/);
    assert.match(source, /const batchDirectoryHandle = await getWritableDirectoryHandle\(\)/);
});
