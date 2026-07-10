# WOS Aide Privacy Policy

Last updated: July 10, 2026

## Overview

WOS Aide is a Chrome extension designed to assist research workflows on Web of Science and related pages. This extension stores user settings locally in the browser and sends user-requested query content only to the external services needed to fulfill the selected feature.

## Data We Store

WOS Aide stores the following data locally in Chrome extension storage and, where needed for page UI state, in browser page storage:

- OpenAI API key provided by the user
- LM Studio base URL, model name, and optional API key provided by the user
- EasyScholar API key provided by the user
- Feature enable/disable settings
- Panel visibility, position, and UI preferences
- DOI lists captured for the current workflow
- Local query history used to improve the user experience

This data is stored locally on the user's device. WOS Aide does not operate its own remote server for storing user account data.

## Data Sent to Third Parties

WOS Aide sends data only when the user enables or actively uses a feature that requires an external service.

### OpenAI

If the user selects OpenAI as the WOS Query provider, WOS Aide sends:

- The user's research query text
- The selected model identifier

to:

- `https://api.openai.com/v1/responses`

The user's OpenAI API key is used only to authenticate that request.

### LM Studio

If the user selects LM Studio as the WOS Query provider, WOS Aide sends:

- The user's research query text
- The selected local model identifier

to the user-configured local endpoint, for example:

- `http://127.0.0.1:1234/v1/chat/completions`

Any LM Studio API key configured by the user is used only for that local endpoint.

### EasyScholar

If the user uses Journal Lookup, WOS Aide sends:

- The journal/publication name entered or captured by the user

to:

- `https://www.easyscholar.cc/open/getPublicationRank`

The user's EasyScholar API key is used only to authenticate that request.

## Local File Access

Some export and download features can ask the user to choose a local directory using the browser file picker. The PDF Batch Downloader can also read text files that the user explicitly drops onto its panel to extract DOI values locally. WOS Aide only accesses directories and files the user explicitly selects. This access supports user-requested research workflows such as reading DOI text or saving files locally.

WOS Aide does not upload local files to a developer-operated server.

## Permissions

WOS Aide requests only the permissions needed for its functionality:

- `storage`: save user settings and workflow state locally
- `clipboardWrite`: copy workflow content on user request
- `activeTab`: interact with the tab the user is actively using
- `scripting`: inject extension UI and workflow helpers when needed

Host permissions are used only for:

- Supported Web of Science pages on `webofscience.com` and legacy-compatible `webofknowledge.com` or `isiknowledge.com` hosts
- OpenAI API requests
- EasyScholar API requests
- User-configured local LM Studio endpoints

## Data Sharing and Selling

WOS Aide does not sell personal data.

WOS Aide does not share user data with third parties except when the user explicitly uses a feature that requires sending the request to OpenAI, EasyScholar, or the user's own LM Studio endpoint.

## Data Retention and Control

Users can control their stored data by:

- Clearing API keys in the extension popup
- Clearing DOI lists in the extension popup
- Removing the extension from Chrome
- Clearing browser storage

## Contact

For support or privacy questions, use the repository issue tracker:

- https://github.com/iihciyekub/wos-aide-extension/issues
