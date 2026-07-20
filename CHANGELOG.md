# Changelog

## Unreleased

## 0.1.18 - 2026-07-20

### Added
- Added a WOS Quick Actions card to the popup that automatically retrieves the active tab's SID and opens DOI Search or UUID Download directly.

### Changed
- Made popup DOI and UUID actions force-open the requested WOS tool tab instead of only restoring the page toolbar.

## 0.1.17 - 2026-07-20

### Fixed
- Read the current SID directly from the active WoS tab's MAIN world on every toolbar action, with bounded retries and the legacy page bridge as a fallback.
- Removed the SID toolbar's dependency on a one-time helper-listener injection and distinguished SID lookup failures from clipboard failures in its feedback.
- Prevented repeated fallback injections from registering duplicate SID bridge listeners.

## 0.1.16 - 2026-07-20

### Fixed
- Refreshed the current Web of Science SID every time it is copied or used by an internal API request instead of relying on a cached value.
- Recovered the SID from the current WoS bootstrap script when the page removes `window.sessionData` after application startup.
- Corrected the WOS helper SID path and prevented API requests from failing when `sessionData` is unavailable.

## 0.1.15 - 2026-07-19

### Added
- Added a popup WOS page diagnosis action that reports toolbar, icon fallback, page-script injection, and host-access status.
- Added explicit, persistent support for institution-specific HTTPS WOS proxy hosts after the user grants access to that exact origin.

### Changed
- Moved page-context script loading to Chrome's native MAIN-world injection API to avoid page Content Security Policy failures.
- Persisted the DOI PDF Download toggle and applied changes to open WOS tabs without reopening the popup.

### Fixed
- Kept WOS toolbar controls visible with text fallbacks when Font Awesome cannot load on a computer or network.
- Prevented WOS-only PDF panel initialization from running on unrelated pages.
- Preserved proxy-host recognition across navigation and refresh, including generic institutional proxy domains whose rewritten URL no longer contains the WOS hostname.
- Restored visible popup status and error reporting instead of discarding diagnostic messages.

## 0.1.13 - 2026-07-15

### Fixed
- Deduplicated PDF index records by SHA-256 during both folder synchronization and download recording.
- Preferred canonical encoded DOI filenames over legacy underscore filenames when both point to identical PDF content.
- Preserved duplicate physical PDF files while preventing duplicate hashes from being written to `pdf-download-index.json`.

## 0.1.12 - 2026-07-15

### Fixed
- Encoded DOI characters such as `/`, `:`, `*`, and `?` into reversible, cross-platform-safe PDF filenames before using the File System Access API.
- Preserved folder synchronization support for both the new encoded filenames and legacy slash-to-underscore filenames.

## 0.1.11 - 2026-07-15

### Fixed
- Authorized and pinned each PDF batch to the current tab's selected directory before starting network downloads.
- Removed the silent anchor-download fallback that sent PDFs to the system Downloads folder when directory permission or writing failed.
- Stopped the batch with a clear folder error when its selected directory becomes unavailable or unwritable.

## 0.1.10 - 2026-07-15

### Fixed
- Prevented PDF module injection from hanging when the current-tab lookup does not respond, with a tab-local session fallback after a short timeout.
- Made cross-tab PDF locking fall back safely when Web Locks cannot be acquired, without rerunning a failed protected write.
- Replaced non-ASCII punctuation in the PDF downloader interface and logging with plain ASCII characters.

## 0.1.9 - 2026-07-15

### Added
- Added per-tab PDF download directories that are restored independently when each browser tab reloads.
- Added cross-tab Web Locks around PDF file and index updates to prevent competing writes when tabs use the same folder.

## 0.1.8 - 2026-07-15

### Added
- Added a `tandfonline` PDF path preset using `/doi/pdf/{doi}?needAccess=true`.

### Changed
- Removed the `POMS/JOM` and `JMMD` PDF path presets.
- Made PDF download settings save while typing and apply to an active download; concurrency now resizes the current worker pool, while delay and cooldown timers use live values.

## 0.1.7 - 2026-07-15

### Added
- Added configurable PDF download concurrency (1-10), with `1` preserving serial downloads and higher values running a bounded worker pool.

## 0.1.6 - 2026-07-14

### Added
- Added a Stop action that can cancel an active PDF batch download, including requests and cooldown waits.
- Added a live unique DOI count above the PDF download list.

### Changed
- Made downloaded-DOI filtering case-insensitive when synchronizing the selected PDF folder.

### Fixed
- Prevented repeated local-file picker activation while a picker dialog is already open.
- Made SID copy feedback reset reliably when the toolbar is recreated before its feedback timer completes.

## 0.1.5 - 2026-07-13

### Fixed
- Made PDF folder synchronization backfill non-empty download timestamps and canonical DOI source URLs for existing files, keeping generated version 1 indexes compatible with NetVault.
- Made a subsequent folder synchronization repair legacy index records whose `downloadedAt` or `sourceUrl` value is missing or null.

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
