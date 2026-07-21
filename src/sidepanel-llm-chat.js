'use strict';

const { isWosLocation } = require('./wos-host');

const HISTORY_KEY = 'wosAideLlmChatHistory';
const MAX_HISTORY_ITEMS = 20;

const queryActiveTab = () => new Promise(resolve => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] || null));
});

const isWosTab = tab => {
  try {
    const url = new URL(tab?.url || '');
    return Boolean(tab?.id && isWosLocation(url.hostname, url.href));
  } catch (_error) {
    return false;
  }
};

const sendRuntimeMessage = message => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(message, response => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (!response?.success) reject(new Error(response?.error || 'Request failed.'));
    else resolve(response);
  });
});

const executeWosQuery = (tabId, rowText) => new Promise((resolve, reject) => {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async query => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (window.wos && typeof window.wos.query === 'function') {
          await window.wos.query(query);
          return true;
        }
        await new Promise(done => setTimeout(done, 100));
      }
      throw new Error('WOS page API is not ready. Reload the WOS page and try again.');
    },
    args: [rowText]
  }, results => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else resolve(Boolean(results?.[0]?.result));
  });
});

function initializeLlmSidePanelChat() {
  const elements = {
    messages: document.getElementById('llmChatMessages'),
    input: document.getElementById('llmChatInput'),
    sendBtn: document.getElementById('sendLlmChatBtn'),
    runBtn: document.getElementById('runLastWosQueryBtn'),
    clearBtn: document.getElementById('clearLlmChatBtn'),
    status: document.getElementById('llmChatStatus')
  };
  if (!elements.messages || !elements.input || !elements.sendBtn) return;

  let history = [];
  let lastRowText = '';
  let sending = false;

  const setStatus = (message, variant = 'muted') => {
    elements.status.textContent = message;
    elements.status.className = `helper status--${variant}`;
  };

  const persistHistory = () => {
    chrome.storage.local.set({ [HISTORY_KEY]: history.slice(-MAX_HISTORY_ITEMS) });
  };

  const renderHistory = () => {
    elements.messages.replaceChildren();
    if (!history.length) {
      elements.messages.hidden = true;
      lastRowText = '';
      elements.runBtn.disabled = true;
      return;
    }

    elements.messages.hidden = false;
    history.forEach(item => {
      const userBubble = document.createElement('div');
      userBubble.className = 'llm-chat-message llm-chat-message--user';
      userBubble.textContent = item.prompt;
      const queryBubble = document.createElement('div');
      queryBubble.className = 'llm-chat-message llm-chat-message--assistant';
      const label = document.createElement('span');
      label.textContent = 'WOS query';
      const code = document.createElement('code');
      code.textContent = item.rowText;
      queryBubble.append(label, code);
      elements.messages.append(userBubble, queryBubble);
    });
    lastRowText = history.at(-1)?.rowText || '';
    elements.runBtn.disabled = !lastRowText;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  };

  const runQuery = async rowText => {
    const tab = await queryActiveTab();
    if (!isWosTab(tab)) {
      setStatus('Query generated. Open a Web of Science page, then use “Run last query”.', 'muted');
      return false;
    }
    setStatus('Running query in the current WOS page…', 'info');
    await executeWosQuery(tab.id, rowText);
    setStatus('WOS query generated and executed.', 'success');
    return true;
  };

  const send = async () => {
    const prompt = elements.input.value.trim();
    if (!prompt || sending) return;
    sending = true;
    elements.sendBtn.disabled = true;
    elements.input.disabled = true;
    setStatus('Generating WOS query…', 'info');
    try {
      const response = await sendRuntimeMessage({ type: 'GENERATE_WOS_QUERY', text: prompt });
      const rowText = String(response.rowText || '').trim();
      if (!rowText) throw new Error('The LLM returned an empty WOS query.');
      history.push({ prompt, rowText, createdAt: new Date().toISOString() });
      history = history.slice(-MAX_HISTORY_ITEMS);
      lastRowText = rowText;
      persistHistory();
      renderHistory();
      elements.input.value = '';
      await runQuery(rowText);
    } catch (error) {
      setStatus(error?.message || String(error), 'error');
    } finally {
      sending = false;
      elements.sendBtn.disabled = false;
      elements.input.disabled = false;
      elements.input.focus();
    }
  };

  elements.sendBtn.addEventListener('click', () => { void send(); });
  elements.input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  });
  elements.runBtn.addEventListener('click', async () => {
    if (!lastRowText) return;
    elements.runBtn.disabled = true;
    try {
      await runQuery(lastRowText);
    } catch (error) {
      setStatus(error?.message || String(error), 'error');
    } finally {
      elements.runBtn.disabled = !lastRowText;
    }
  });
  elements.clearBtn.addEventListener('click', () => {
    history = [];
    lastRowText = '';
    persistHistory();
    renderHistory();
    setStatus('Conversation cleared.', 'muted');
  });

  chrome.storage.local.get([HISTORY_KEY], result => {
    history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY].slice(-MAX_HISTORY_ITEMS) : [];
    renderHistory();
  });
}

module.exports = {
  initializeLlmSidePanelChat,
  isWosTab
};
