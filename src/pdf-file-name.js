const forcePercentEncode = (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;

const pdfFileNameForDoi = (doi) => {
    const normalized = String(doi ?? "").trim();
    const encoded = encodeURIComponent(normalized)
        // encodeURIComponent leaves these characters unescaped. Encode them as
        // well so the resulting name uses only cross-platform-safe characters,
        // and escape underscores because they mark encoded bytes below.
        .replace(/[!'()*_]/g, forcePercentEncode)
        .replace(/%/g, "_");
    return `${encoded}.pdf`;
};

const doiFromPdfFileName = (fileName) => {
    const name = String(fileName ?? "").replace(/\.pdf$/i, "");
    if (/_([0-9A-Fa-f]{2})/.test(name)) {
        try {
            return decodeURIComponent(name.replace(/_([0-9A-Fa-f]{2})/g, "%$1"));
        } catch (_error) {
            // Fall through to the legacy slash-to-underscore format.
        }
    }

    const separatorIndex = name.indexOf("_");
    return separatorIndex < 0
        ? name
        : `${name.slice(0, separatorIndex)}/${name.slice(separatorIndex + 1)}`;
};

module.exports = {
    doiFromPdfFileName,
    pdfFileNameForDoi
};
