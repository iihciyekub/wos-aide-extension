'use strict';

// Dynamic content-script registrations use this marker so an institution's
// generic proxy hostname stays trusted after the original WOS URL disappears.
globalThis.__WOS_AIDE_PROXY_HOST__ = true;
