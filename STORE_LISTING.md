# Chrome Web Store Submission Notes

## One-line Summary

WOS Aide helps Web of Science users build queries, look up journal information, manage DOI workflows, and batch-handle related research tasks.

## Detailed Description

WOS Aide is a research workflow assistant for Web of Science users.

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

Used to inject the extension UI and tools into supported pages when needed.

### Host permissions

Supported Web of Science page access:

- `https://*.webofscience.com/*`
- `*://*.webofknowledge.com/*` for legacy compatibility
- `*://*.isiknowledge.com/*` for legacy compatibility

`https://api.openai.com/*`

- Used only when the user selects OpenAI for WOS Query generation.

`https://www.easyscholar.cc/*`

- Used only when the user uses Journal Lookup with EasyScholar.

`http://127.0.0.1/*` and `http://localhost/*`

- Used only when the user configures a local LM Studio endpoint.

## Single Purpose Statement

WOS Aide exists to help researchers perform Web of Science query building, journal lookup, DOI handling, and related research workflow tasks directly in the browser.

## Reviewer Notes

- The extension primarily runs on Web of Science pages.
- A lightweight helper also runs on ChatGPT pages only for prompt quickload support.
- The extension does not use a developer-operated backend.
- User-entered API keys are stored locally in extension storage.
- Requests to OpenAI, EasyScholar, or LM Studio happen only when the user explicitly uses those features.

## Pre-submission Checklist

- Verify the published privacy policy at `https://iihciyekub.github.io/wos-aide-extension/` before submission.
- Remove `build.pem` from the working directory and keep it outside the repo.
- Double-check that the Web Store data disclosure form matches the behavior described in `PRIVACY.md`.
