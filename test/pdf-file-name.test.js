const test = require("node:test");
const assert = require("node:assert/strict");

const {
    doiFromPdfFileName,
    pdfFileNameForDoi
} = require("../src/pdf-file-name");

test("DOI filenames encode characters rejected by File System Access", () => {
    const doi = "10.1023/b:jota.0000043997.42194.dc";
    const fileName = pdfFileNameForDoi(doi);

    assert.equal(fileName, "10.1023_2Fb_3Ajota.0000043997.42194.dc.pdf");
    assert.doesNotMatch(fileName, /[<>:"/\\|?*]/);
    assert.equal(doiFromPdfFileName(fileName), doi);
});

test("DOI filename encoding preserves underscores and Unicode", () => {
    const doi = "10.1000/test_value-测试";
    const fileName = pdfFileNameForDoi(doi);

    assert.equal(doiFromPdfFileName(fileName), doi);
    assert.doesNotMatch(fileName, /[<>:"/\\|?*]/);
});

test("legacy slash-to-underscore PDF filenames remain readable", () => {
    assert.equal(doiFromPdfFileName("10.1000_old-name.pdf"), "10.1000/old-name");
});
