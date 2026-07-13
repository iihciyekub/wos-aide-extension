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

module.exports = {
  buildSynchronizedPdfProvenance,
  doiResolverUrl
};
