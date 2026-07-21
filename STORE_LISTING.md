# Chrome Web Store Submission Notes

## One-line Summary

WOS Aide provides browser-based research helpers, with specialized Web of Science and CNKI workflows.

## Detailed Description

WOS Aide is a browser-based research workflow assistant. General helpers are available on ordinary HTTP and HTTPS pages, while specialized features activate only on compatible Web of Science, CNKI, and ChatGPT pages.

Core features:

- DOI batch query tools on Web of Science pages
- WOS query builder with OpenAI or a user-configured local LM Studio endpoint
- Journal lookup with EasyScholar
- DOI workflow helpers and export-related utilities
- PDF batch downloads with configurable batch size and second-based delays
- Drag-and-drop DOI extraction from user-selected text files
- A top-center floating shortcut toolbar with one-click SID copy

WOS Aide stores settings locally in the browser and only contacts third-party services when the user explicitly enables and uses those features.

Third-party integrations used only on user request:

- OpenAI
- EasyScholar
- User-configured local LM Studio endpoint

## Permissions Justification

### storage

Used to store:

- API keys entered by the user
- provider settings
- feature toggles
- panel state and local workflow data

### clipboardWrite

Used when the user explicitly copies workflow content, including one-click SID copy.

### activeTab

Used so the extension can interact only with the tab the user is currently using.

### scripting

Used to inject the extension UI and workflow helpers into ordinary web pages when needed.

### Host permissions

- `http://*/*` and `https://*/*`: allow general research and download helpers on publisher, institution proxy, and other ordinary web pages without repeated per-site permission prompts.
- Site-specific WOS, CNKI, and ChatGPT behavior remains gated by the current page URL.
- The same access covers user-requested OpenAI and EasyScholar calls and user-configured local LM Studio endpoints.

## Single Purpose Statement

WOS Aide exists to help researchers perform Web of Science query building, journal lookup, DOI handling, and related research workflow tasks directly in the browser.

## Reviewer Notes

- The general content script is available on standard HTTP and HTTPS pages so research and download helpers work across publisher and proxy sites.
- WOS, CNKI, and ChatGPT-specific behavior activates only on matching pages.
- The extension does not use a developer-operated backend.
- User-entered API keys are stored locally in extension storage.
- Requests to OpenAI, EasyScholar, or LM Studio happen only when the user explicitly uses those features.

## Pre-submission Checklist

- Verify the published privacy policy at `https://iihciyekub.github.io/wos-aide-extension/` before submission.
- Remove `build.pem` from the working directory and keep it outside the repo.
- Double-check that the Web Store data disclosure form matches the behavior described in `PRIVACY.md`.
