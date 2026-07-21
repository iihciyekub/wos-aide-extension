# Chrome Web Store Privacy Disclosure Checklist

This file is a practical guide for filling the Chrome Web Store privacy section for WOS Aide.

## Recommended Disclosure Direction

Use this as a review checklist, then confirm it against the latest Chrome Web Store form wording at submission time.

Published privacy policy: `https://iihciyekub.github.io/wos-aide-extension/`

## What The Extension Handles

WOS Aide may handle:

- User-entered API keys
- User-entered research query text
- Journal names entered or captured by the user
- DOI lists used in the workflow
- Text files explicitly dropped onto the PDF panel for local DOI extraction
- Local settings and history stored in the browser

## Suggested Form Answers

### Single Purpose

Suggested answer:

- The extension provides browser-based research helpers, including DOI handling and specialized Web of Science and CNKI workflows.

### Data Collection

Suggested answer:

- Yes, the extension handles user-provided data necessary for the requested workflow.

### What Data Types Apply

Most likely applicable:

- Personal communications:
  Usually `No`, unless you consider free-form query text as user content in a way the form explicitly classifies there.

- Website content:
  `Yes`, because the general content script can read the current HTTP or HTTPS page to provide user-requested workflow features.

- User activity:
  `Yes`, in a limited functional sense, because the extension reacts to user actions on ordinary web pages.

- Authentication information:
  `Yes`, because user-provided API keys are stored locally and used to authenticate requests.

- Personal information:
  Usually `No`, unless your support/contact or feature set later adds account/profile data.

- Health information:
  `No`

- Financial and payment information:
  `No`

- Location:
  `No`

- Web history:
  Usually `No` if you are not tracking browsing history across sites.

### Is The Data Sold?

Suggested answer:

- No

### Is The Data Used For Creditworthiness Or Lending?

Suggested answer:

- No

### Why Is Data Collected?

Suggested purposes:

- To provide the extension's core functionality
- To authenticate user-requested API calls
- To store user settings and workflow preferences

Do not claim advertising, profiling, or resale purposes.

### Is Data Shared With Third Parties?

Suggested answer:

- Yes, but only when the user explicitly uses a feature that sends a request to the selected third-party service.

Third parties to mention:

- OpenAI
- EasyScholar
- User-configured local LM Studio endpoint

### Is Data Handled Securely?

Suggested answer:

- Data is stored locally in Chrome extension storage where applicable.
- External requests are sent only to the selected service endpoint needed to fulfill the user-requested action.

## Notes For Consistency

Make sure these statements stay aligned across:

- `PRIVACY.md`
- `STORE_LISTING.md`
- `STORE_LISTING_BILINGUAL.md`
- Chrome Web Store privacy disclosure form
- Chrome Web Store description text

## Final Manual Check Before Submission

- Confirm the final form wording in Chrome Web Store has not changed.
- Use the most conservative truthful answer when a category is ambiguous.
- Do not under-disclose API key handling or page-content access.
- Keep the privacy policy URL, store description, and disclosure form mutually consistent.
