'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { isWosTab } = require('../src/sidepanel-llm-chat');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('LLM conversation is hosted in the side panel and runs generated WOS queries', () => {
  const html = read('public/sidepanel.html');
  const chat = read('src/sidepanel-llm-chat.js');
  const contentScript = read('src/contentScript.js');

  assert.match(html, /id="llmChatMessages"/);
  assert.match(html, /id="llmChatInput"/);
  assert.match(html, /id="sendLlmChatBtn"/);
  assert.match(chat, /GENERATE_WOS_QUERY/);
  assert.match(chat, /window\.wos\.query/);
  assert.match(chat, /wosAideLlmChatHistory/);
  assert.doesNotMatch(contentScript, /injectModule\('openaiChat'\)/);
  assert.match(contentScript, /action:\s*'sidepanel-llm'/);
});

test('LLM query runner recognizes WOS tabs but ignores Chrome internal pages', () => {
  assert.equal(isWosTab({ id: 1, url: 'https://www.webofscience.com/wos/woscc/summary/abc' }), true);
  assert.equal(isWosTab({ id: 2, url: 'chrome://extensions/' }), false);
});
