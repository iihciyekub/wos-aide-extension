const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSynchronizedPdfProvenance,
  doiResolverUrl
} = require("../src/pdf-index-record");

test("folder synchronization preserves complete download provenance", () => {
  const previous = {
    downloadedAt: "2026-07-13T08:30:00.000Z",
    sourceUrl: "/doi/pdfdirect/10.1111/example?download=true"
  };

  assert.deepEqual(buildSynchronizedPdfProvenance({
    previous,
    doi: "10.1111/example",
    lastModified: 1783931444891,
    synchronizedAt: "2026-07-13T08:40:00.000Z"
  }), previous);
});

test("folder synchronization repairs missing provenance for an existing PDF", () => {
  const provenance = buildSynchronizedPdfProvenance({
    previous: { downloadedAt: null, sourceUrl: null },
    doi: "10.1207/s15327663jcp1001&2_01",
    lastModified: Date.parse("2026-07-13T08:31:44.891Z"),
    synchronizedAt: "2026-07-13T08:40:00.000Z"
  });

  assert.equal(provenance.downloadedAt, "2026-07-13T08:31:44.891Z");
  assert.equal(
    provenance.sourceUrl,
    "https://doi.org/10.1207/s15327663jcp1001%262_01"
  );
});

test("folder synchronization falls back to its own timestamp", () => {
  const provenance = buildSynchronizedPdfProvenance({
    previous: {},
    doi: "10.1111/joms.12806",
    lastModified: "invalid",
    synchronizedAt: "2026-07-13T08:40:00.000Z"
  });

  assert.equal(provenance.downloadedAt, "2026-07-13T08:40:00.000Z");
  assert.equal(provenance.sourceUrl, "https://doi.org/10.1111/joms.12806");
});

test("DOI resolver URLs encode query and fragment delimiters in DOI suffixes", () => {
  assert.equal(
    doiResolverUrl("10.1234/value?part#section"),
    "https://doi.org/10.1234/value%3Fpart%23section"
  );
});
