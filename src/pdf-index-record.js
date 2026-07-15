const nonEmptyString = (value) => (
  typeof value === "string" && value.trim() ? value : null
);

const doiResolverUrl = (doi) => {
  const encodedDoi = String(doi || "")
    .trim()
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
  return `https://doi.org/${encodedDoi}`;
};

const isoTimestamp = (value) => {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
};

const buildSynchronizedPdfProvenance = ({ previous, doi, lastModified, synchronizedAt }) => ({
  downloadedAt: nonEmptyString(previous?.downloadedAt)
    || isoTimestamp(lastModified)
    || isoTimestamp(synchronizedAt)
    || new Date().toISOString(),
  sourceUrl: nonEmptyString(previous?.sourceUrl) || doiResolverUrl(doi)
});

const deduplicatePdfRecordsBySha = (records, isPreferred = () => false) => {
  const selected = new Map();
  const duplicates = [];

  for (const record of records || []) {
    const key = nonEmptyString(record?.sha256)
      ? `sha256:${record.sha256.toLowerCase()}`
      : `filename:${record?.filename || selected.size}`;
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, record);
      continue;
    }

    const replaceExisting = isPreferred(record) && !isPreferred(existing);
    if (replaceExisting) {
      selected.set(key, record);
      duplicates.push(existing);
    } else {
      duplicates.push(record);
    }
  }

  return { records: Array.from(selected.values()), duplicates };
};

module.exports = {
  buildSynchronizedPdfProvenance,
  deduplicatePdfRecordsBySha,
  doiResolverUrl
};
