const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveWosSidInMainWorld } = require('../src/wos-sid-main-world');

const LIVE_SID = 'EUW1ED0A82h3SMAlxl3wU1DayZFoj';
const SCRIPT_SID = 'USW2EC0B00abcdefghijklmnopqrstu';

test('MAIN-world SID resolver reads the live session on every invocation', () => {
  const context = {
    windowObject: { sessionData: { BasicProperties: { SID: LIVE_SID } } },
    locationObject: { href: 'https://www.webofscience.com/' },
    documentObject: { scripts: [] }
  };
  assert.equal(resolveWosSidInMainWorld(context), LIVE_SID);
  context.windowObject.sessionData.BasicProperties.SID = SCRIPT_SID;
  assert.equal(resolveWosSidInMainWorld(context), SCRIPT_SID);
});

test('MAIN-world SID resolver recovers from the current bootstrap script', () => {
  assert.equal(resolveWosSidInMainWorld({
    windowObject: {},
    locationObject: { href: 'https://www.webofscience.com/wos/woscc/summary/example' },
    documentObject: {
      scripts: [{
        src: '',
        textContent: `window.sessionData={"BasicProperties":{"SID":"${SCRIPT_SID}"}}`
      }]
    }
  }), SCRIPT_SID);
});
