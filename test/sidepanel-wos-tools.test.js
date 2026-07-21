'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractIdentifiers } = require('../src/sidepanel-wos-tools');

test('side-panel WOS search extracts and deduplicates DOI and WOS identifiers', () => {
  const result = extractIdentifiers(`
    WOS:000123456789012
    https://doi.org/10.1000/Example.1
    doi: 10.1000/example.1
    WOS:000123456789012
    unrelated text
  `);

  assert.deepEqual(result.wosids, ['WOS:000123456789012']);
  assert.deepEqual(result.dois, ['10.1000/example.1']);
});
