# Changelog

## Unreleased

## 0.1.4 - 2026-07-13

### Added
- Added a synchronized `pdf-download-index.json` companion index with DOI, filename, size, modification time, SHA-256 hash, download time, source URL, and validation metadata.
- Added fast PDF validation before saving downloads, including HTTP status, response type, PDF header, minimum size, and end-marker checks.
- Added incremental PDF validation during folder synchronization; unchanged valid files reuse their existing hashes and validation results.

### Changed
- Widened the PDF Batch Downloader and added consistently aligned Font Awesome icons with shorter, single-line button labels.
- Changed delay inputs to locale-independent decimal text fields so values such as `0.1` seconds are accepted reliably.
- Updated PDF filenames to replace every DOI path separator while retaining the exact DOI in the JSON index.
- Made folder synchronization treat the directory as authoritative, removing missing or invalid PDFs from the JSON index without deleting physical files.

### Fixed
- Prevented HTML pages, JSON error responses, truncated files, and other obviously invalid PDF downloads from being saved or indexed.
- Preserved DOI suffix underscores when inferring a DOI from an existing PDF filename.
- Removed duplicate DOI values during text extraction.

## 0.1.3 - 2026-07-13

### Added
- Added Wiley, SAGE, and Springer URL templates to the PDF Batch Downloader.
- Added a local file picker that extracts DOI values from multiple text and bibliography files using the existing DOI parser.
- Persisted the selected PDF provider separately from its URL template so providers sharing the same path restore correctly.

### Changed
- Removed the redundant DOI Batch Query toggle from the extension popup.

### Fixed
- Made the PDF Batch Downloader wait for its scripts and panel DOM before reporting that it opened, eliminating repeated popup clicks.
- Changed the local file picker to use a direct native file-input interaction so the file dialog opens on the first click.

## 0.1.2 - 2026-07-10

### Added
- Added a configurable PDF batch size with a default of 50.
- Added second-based PDF download and batch interval controls with decimal values such as `0.2`.
- Added drag-and-drop text-file DOI extraction to the PDF Batch Downloader by reusing the existing DOI parser.
- Added compatibility for Web of Science legacy `webofknowledge.com` and `isiknowledge.com` hosts.

### Changed
- Moved WoS shortcuts into an independent horizontal floating toolbar attached to the top center of the viewport.
- Changed SID handling to copy directly to the clipboard with one click and inline success or failure feedback.
- Made Journal Query and WOS Query icons appear whenever their corresponding features are enabled; provider verification now controls request readiness rather than visibility.
- Reworked the PDF Batch Downloader with aligned controls and a black, gray, and white interface.
- Changed WoS API calls from a hard-coded `www.webofscience.com` origin to same-origin relative endpoints for better host and proxy compatibility.

### Fixed
- Prevented toolbar shortcuts from shifting into the center of the expanded native WoS sidebar.
- Fixed sub-second cooldown handling and empty numeric-input fallback behavior in PDF batch downloads.
- Updated settings hints so they match the new enabled-versus-verified behavior.

## 0.1.1 - 2026-03-30

### Added
- Added sticky/floating WoS toolbar shortcuts for DOI Query, WOS Export, SID Info, Journal Query, and WOS Query entry points.
- Added SID info quick action with clipboard copy support from the toolbar.

### Changed
- Improved toolbar icon loading so icons render reliably after page refresh.
- Updated single-panel behavior to support closing on `Esc`, outside click, DOI search submit, and SID copy success.
- Refined DOI history navigation to support direct `Up`/`Down` history browsing.
- Simplified Export Flow UUID UI by removing the UUID format hint, moving the Auto toggle inline with the UUID input, and polishing UUID refresh visuals.
- Bumped the extension version to `0.1.1`.

### Fixed
- Hardened Journal Query text capture so large Web of Science detail blocks are no longer pasted into the journal input.
- Limited automatic journal capture to short journal-like candidates and filtered common metadata labels such as DOI, ISSN, ORCID, abstract, funding, and publisher fields.
