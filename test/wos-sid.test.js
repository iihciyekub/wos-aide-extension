const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSidFromBootstrapScripts,
  normalizeWosSid,
  resolveWosSid
} = require('../src/wos-sid');

const LIVE_SID = 'EUW1ED0A82h3SMAlxl3wU1DayZFoj';
const SCRIPT_SID = 'USW2EC0B00abcdefghijklmnopqrstu';

test('prefers the current live WoS session SID', () => {
  assert.equal(resolveWosSid({
    windowObject: { sessionData: { BasicProperties: { SID: LIVE_SID } } },
    locationObject: { href: `https://www.webofscience.com/?SID=${SCRIPT_SID}` },
    documentObject: { scripts: [] }
  }), LIVE_SID);
});

test('falls back to the SID embedded in the WoS bootstrap script', () => {
  const documentObject = {
    scripts: [{
      src: '',
      textContent: `window.sessionData = {"BasicProperties":{"SID":"${SCRIPT_SID}"}};`
    }]
  };

  assert.equal(getSidFromBootstrapScripts(documentObject), SCRIPT_SID);
  assert.equal(resolveWosSid({
    windowObject: {},
    locationObject: { href: 'https://www.webofscience.com/wos/woscc/summary/abc' },
    documentObject
  }), SCRIPT_SID);
});

test('uses the newest matching bootstrap script', () => {
  assert.equal(getSidFromBootstrapScripts({
    scripts: [
      { src: '', textContent: `{"SID":"${LIVE_SID}"}` },
      { src: '', textContent: `{"SID":"${SCRIPT_SID}"}` }
    ]
  }), SCRIPT_SID);
});

test('rejects empty and malformed SID candidates', () => {
  assert.equal(normalizeWosSid(''), '');
  assert.equal(normalizeWosSid('short'), '');
  assert.equal(normalizeWosSid('<script>alert(1)</script>'), '');
});
