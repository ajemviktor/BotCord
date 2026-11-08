/* ==========================================================================
   BotCord - Frontend Client Controller (Multi-Session & Presence Support)
   ========================================================================== */

class BotSession {
  constructor(id, title) {
    this.id = id;
    this.title = title || 'New Session';
    this.bot = null;
    this.status = 'online';
    this.activity = { type: 0, text: '' };
    this.guilds = [];
    this.currentGuild = null;
    this.channels = [];
    this.currentChannel = null;
    this.members = [];
    this.messages = [];
    this.unread = false;
  }
}

const sessions = new Map();
let activeSessionId = null;
let sessionCounter = 0;
let globalEventWs = null;

function getCurrentSession() {
  return sessions.get(activeSessionId);
}

function apiUrl(endpoint) {
  const sess = getCurrentSession();
  if (sess && sess.id && !sess.id.startsWith('temp-')) {
    return `/api/sessions/${sess.id}${endpoint}`;
  }
  return `/api${endpoint}`;
}

// Transparent state proxy for active session
const state = {
  get bot() { const s = getCurrentSession(); return s ? s.bot : null; },
  set bot(v) { const s = getCurrentSession(); if (s) s.bot = v; },

  get guilds() { const s = getCurrentSession(); return s ? s.guilds : []; },
  set guilds(v) { const s = getCurrentSession(); if (s) s.guilds = v; },

  get currentGuild() { const s = getCurrentSession(); return s ? s.currentGuild : null; },
  set currentGuild(v) { const s = getCurrentSession(); if (s) s.currentGuild = v; },

  get currentChannel() { const s = getCurrentSession(); return s ? s.currentChannel : null; },
  set currentChannel(v) { const s = getCurrentSession(); if (s) s.currentChannel = v; },

  get channels() { const s = getCurrentSession(); return s ? s.channels : []; },
  set channels(v) { const s = getCurrentSession(); if (s) s.channels = v; },

  get members() { const s = getCurrentSession(); return s ? s.members : []; },
  set members(v) { const s = getCurrentSession(); if (s) s.members = v; },

  get messages() { const s = getCurrentSession(); return s ? s.messages : []; },
  set messages(v) { const s = getCurrentSession(); if (s) s.messages = v; },
};

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const botTokenInput = document.getElementById('bot-token');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');
const toggleTokenBtn = document.getElementById('toggle-token-visibility');

const tabsContainer = document.getElementById('tabs-scroll-container');
const btnAddTab = document.getElementById('btn-add-tab');

const serversList = document.getElementById('servers-list');
const channelsList = document.getElementById('channels-list');
const currentGuildName = document.getElementById('current-guild-name');
const currentChannelName = document.getElementById('current-channel-name');
const channelTopic = document.getElementById('channel-topic');
const messagesFeed = document.getElementById('messages-feed');
const messagesEmpty = document.getElementById('messages-empty');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const btnSendMessage = document.getElementById('btn-send-message');
const botAvatar = document.getElementById('bot-avatar');
const botUsername = document.getElementById('bot-username');
const botStatusDot = document.querySelector('.bot-avatar-wrap .status-dot');
const btnLogout = document.getElementById('btn-logout');

// Tabs Controller
function createTab(initialTitle) {
  sessionCounter++;
  const tabId = `temp-${sessionCounter}`;
  const sess = new BotSession(tabId, initialTitle || 'New Session');
  sessions.set(tabId, sess);
  switchTab(tabId);
  return sess;
}

function switchTab(tabId) {
  if (!sessions.has(tabId)) return;
  activeSessionId = tabId;
  const sess = sessions.get(tabId);
  sess.unread = false;

  renderTabs();

  if (!sess.bot) {
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    botTokenInput.value = '';
    loginError.textContent = '';
    botTokenInput.focus();
  } else {
    loginScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    renderSessionView(sess);
  }
}

async function closeTab(tabId) {
  const sess = sessions.get(tabId);
  if (!sess) return;

  if (sess.bot && sess.id && !sess.id.startsWith('temp-')) {
    try {
      await fetch(`/api/sessions/${sess.id}/logout`, { method: 'POST' });
    } catch (e) {}
  }

  sessions.delete(tabId);

  if (sessions.size === 0) {
    createTab('New Session');
  } else if (activeSessionId === tabId) {
    const nextTabId = sessions.keys().next().value;
    switchTab(nextTabId);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  sessions.forEach((sess, tabId) => {
    const tabEl = document.createElement('div');
    tabEl.className = `chrome-tab ${tabId === activeSessionId ? 'active' : ''}`;
    tabEl.dataset.tabId = tabId;

    const avatarUrl = sess.bot && sess.bot.avatar
      ? `https://cdn.discordapp.com/avatars/${sess.bot.id}/${sess.bot.avatar}.png?size=32`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const statusClass = sess.status || 'online';

    tabEl.innerHTML = `
      <div class="tab-avatar-wrap">
        <img class="tab-avatar" src="${avatarUrl}" alt="tab">
        <span class="tab-status-dot ${statusClass}"></span>
      </div>
      <span class="tab-title">${escapeHtml(sess.title || (sess.bot ? sess.bot.username : 'New Session'))}</span>
      ${sess.unread ? '<span class="tab-unread-dot"></span>' : ''}
      <button class="tab-close-btn" title="Close Session">✕</button>
    `;

    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close-btn')) {
        e.stopPropagation();
        closeTab(tabId);
        return;
      }
      switchTab(tabId);
    });

    tabsContainer.appendChild(tabEl);
  });
}

if (btnAddTab) {
  btnAddTab.addEventListener('click', () => {
    createTab('New Session');
  });
}

function renderSessionView(sess) {
  botUsername.textContent = sess.bot.username;
  const avatarUrl = sess.bot.avatar
    ? `https://cdn.discordapp.com/avatars/${sess.bot.id}/${sess.bot.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;
  botAvatar.src = avatarUrl;

  updateStatusDotUI(sess.status || 'online');

  const quickStatusSelect = document.getElementById('quick-status-select');
  if (quickStatusSelect) {
    quickStatusSelect.value = sess.status || 'online';
  }

  renderGuilds();

  if (sess.currentGuild) {
    currentGuildName.textContent = sess.currentGuild.name;
    renderChannels();
    renderMembers();

    if (sess.currentChannel) {
      currentChannelName.textContent = sess.currentChannel.name;
      channelTopic.textContent = sess.currentChannel.topic || '';
      messageInput.disabled = false;
      btnSendMessage.disabled = false;
      messageInput.placeholder = `Message #${sess.currentChannel.name} as ${sess.bot.username}...`;

      messagesFeed.innerHTML = '';
      if (sess.messages.length === 0) {
        messagesEmpty.style.display = 'block';
      } else {
        messagesEmpty.style.display = 'none';
        sess.messages.forEach(msg => appendMessage(msg));
        scrollToBottom();
      }
    } else {
      clearChat();
    }
  } else {
    currentGuildName.textContent = 'Select a Server';
    channelsList.innerHTML = '<div class="channels-empty">Select a server from the left sidebar to view channels.</div>';
    clearChat();
  }
}

function updateStatusDotUI(status) {
  if (botStatusDot) {
    botStatusDot.className = `status-dot ${status || 'online'}`;
  }
}

// Toggle password visibility
toggleTokenBtn.addEventListener('click', () => {
  const isPass = botTokenInput.type === 'password';
  botTokenInput.type = isPass ? 'text' : 'password';
});

// Login Handler
btnLogin.addEventListener('click', handleLogin);
botTokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});

async function handleLogin() {
  const token = botTokenInput.value.trim();
  if (!token) {
    showError('Please enter a valid Discord Bot Token.');
    return;
  }

  setLoginLoading(true);
  loginError.textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate token with Discord.');
    }

    const sess = getCurrentSession();
    sess.id = data.session_id;
    sess.bot = data.bot;
    sess.title = data.bot.username;
    sess.status = 'online';

    botTokenInput.value = '';
    renderTabs();
    initApp();
  } catch (err) {
    showError(err.message);
  } finally {
    setLoginLoading(false);
  }
}

function setLoginLoading(loading) {
  btnLogin.disabled = loading;
  btnLogin.querySelector('.btn-text').style.display = loading ? 'none' : 'inline';
  btnLogin.querySelector('.btn-spinner').style.display = loading ? 'inline-block' : 'none';
}

function showError(msg) {
  loginError.textContent = msg;
}

// App Initialization
function initApp() {
  const sess = getCurrentSession();
  if (!sess) return;

  loginScreen.style.display = 'none';
  appScreen.style.display = 'flex';

  renderSessionView(sess);
  fetchGuilds();
  connectEventSocket();
}

// Real-time Gateway Events WebSocket
function connectEventSocket() {
  if (globalEventWs && (globalEventWs.readyState === WebSocket.OPEN || globalEventWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  globalEventWs = new WebSocket(`${protocol}//${location.host}/api/events`);

  globalEventWs.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'MESSAGE_CREATE') {
        const sid = payload.session_id;
        const msg = payload.data;

        let targetSession = null;
        for (const s of sessions.values()) {
          if (s.id === sid) {
            targetSession = s;
            break;
          }
        }

        if (targetSession) {
          if (targetSession.currentChannel && msg.channel_id === targetSession.currentChannel.id) {
            targetSession.messages.push(msg);
            if (getCurrentSession() === targetSession) {
              appendMessage(msg);
              scrollToBottom();
            } else {
              targetSession.unread = true;
              renderTabs();
            }
          }
        }
      } else if (payload.type === 'GUILDS_UPDATED') {
        fetchGuilds();
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };

  globalEventWs.onclose = () => {
    setTimeout(connectEventSocket, 3000);
  };
}

// Fetch Servers / Guilds
async function fetchGuilds() {
  try {
    const res = await fetch(apiUrl('/guilds'));
    const data = await res.json();
    state.guilds = data.guilds || [];
    renderGuilds();

    if (state.guilds.length > 0 && !state.currentGuild) {
      selectGuild(state.guilds[0]);
    }
  } catch (err) {
    console.error('Failed to load guilds:', err);
  }
}

function renderGuilds() {
  serversList.innerHTML = '';
  state.guilds.forEach((guild) => {
    const div = document.createElement('div');
    div.className = `server-item ${state.currentGuild && state.currentGuild.id === guild.id ? 'active' : ''}`;
    div.title = guild.name;

    if (guild.icon) {
      const img = document.createElement('img');
      img.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`;
      img.alt = guild.name;
      div.appendChild(img);
    } else {
      const initials = guild.name.split(' ').map(w => w[0]).slice(0, 3).join('');
      div.textContent = initials;
    }

    div.addEventListener('click', () => selectGuild(guild));
    serversList.appendChild(div);
  });
}

// Select Guild
async function selectGuild(guild) {
  state.currentGuild = guild;
  currentGuildName.textContent = guild.name;
  renderGuilds();

  fetchMembers(guild.id);

  try {
    const res = await fetch(apiUrl(`/guilds/${guild.id}/channels`));
    const data = await res.json();
    state.channels = data.channels || [];
    renderChannels();

    // Select first text channel
    const firstTextChannel = state.channels.find(c => c.type === 0 || c.type === 5);
    if (firstTextChannel) {
      selectChannel(firstTextChannel);
    } else {
      clearChat();
    }
  } catch (err) {
    console.error('Failed to load channels:', err);
  }
}

// Render Channels
function renderChannels() {
  channelsList.innerHTML = '';

  const textChannels = state.channels.filter(c => c.type === 0 || c.type === 5);
  if (textChannels.length === 0) {
    channelsList.innerHTML = '<div class="channels-empty">No text channels accessible by this bot.</div>';
    return;
  }

  // Group channels: Categorized vs Uncategorized
  const categories = state.channels.filter(c => c.type === 4);
  const categorizedMap = new Map();

  categories.forEach(cat => categorizedMap.set(cat.id, { category: cat, channels: [] }));
  const uncategorized = [];

  textChannels.forEach(ch => {
    if (ch.parent_id && categorizedMap.has(ch.parent_id)) {
      categorizedMap.get(ch.parent_id).channels.push(ch);
    } else {
      uncategorized.push(ch);
    }
  });

  uncategorized.forEach(ch => appendChannelItem(ch));

  categorizedMap.forEach(group => {
    if (group.channels.length > 0) {
      const catHeader = document.createElement('div');
      catHeader.className = 'channel-category';
      catHeader.textContent = group.category.name;
      channelsList.appendChild(catHeader);

      group.channels.forEach(ch => appendChannelItem(ch));
    }
  });
}

function appendChannelItem(ch) {
  const item = document.createElement('div');
  item.className = `channel-item ${state.currentChannel && state.currentChannel.id === ch.id ? 'active' : ''}`;
  item.innerHTML = `<span class="hash-icon">#</span><span class="channel-name">${escapeHtml(ch.name)}</span>`;
  item.addEventListener('click', () => selectChannel(ch));
  channelsList.appendChild(item);
}

// Select Channel
async function selectChannel(ch) {
  state.currentChannel = ch;
  currentChannelName.textContent = ch.name;
  channelTopic.textContent = ch.topic || '';
  renderChannels();

  messageInput.disabled = false;
  btnSendMessage.disabled = false;
  messageInput.placeholder = `Message #${ch.name} as ${state.bot.username}...`;
  messageInput.focus();

  fetchMessages(ch.id);
}

function clearChat() {
  state.currentChannel = null;
  currentChannelName.textContent = 'no-channel';
  channelTopic.textContent = '';
  messagesFeed.innerHTML = '';
  messagesEmpty.style.display = 'block';
  messageInput.disabled = true;
  btnSendMessage.disabled = true;
  messageInput.placeholder = 'Select a channel first';
}

// Fetch Messages
async function fetchMessages(channelId) {
  messagesFeed.innerHTML = '';
  messagesEmpty.style.display = 'none';

  try {
    const res = await fetch(apiUrl(`/channels/${channelId}/messages`));
    const data = await res.json();
    state.messages = (data.messages || []).reverse(); // Oldest to newest

    if (state.messages.length === 0) {
      messagesEmpty.style.display = 'block';
    } else {
      state.messages.forEach(msg => appendMessage(msg));
      scrollToBottom();
    }
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

// Render Single Message
function appendMessage(msg) {
  messagesEmpty.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'msg-row';

  const author = msg.author || { username: 'Unknown', id: '0' };
  const avatarUrl = author.avatar
    ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  const timeStr = formatTimestamp(msg.timestamp);

  // Render Attachments (Images, Photos, Files)
  let attachmentsHtml = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachmentsHtml = `<div class="msg-attachments">` + msg.attachments.map(att => {
      const isImg = (att.content_type && att.content_type.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(att.url);
      if (isImg) {
        return `<div class="attachment-image-wrap"><a href="${escapeHtml(att.url)}" target="_blank" rel="noreferrer"><img class="attachment-img" src="${escapeHtml(att.url)}" alt="${escapeHtml(att.filename || 'image')}" loading="lazy"></a></div>`;
      }
      return `<div class="attachment-file"><a href="${escapeHtml(att.url)}" target="_blank" rel="noreferrer" class="attachment-file-link">📎 ${escapeHtml(att.filename || 'Download file')}</a></div>`;
    }).join('') + `</div>`;
  }

  // Render Rich Embeds
  let embedsHtml = '';
  if (msg.embeds && msg.embeds.length > 0) {
    embedsHtml = msg.embeds.map(embed => {
      const colorStyle = embed.color ? `border-left-color: #${embed.color.toString(16).padStart(6, '0')}` : '';

      const authorHtml = embed.author && embed.author.name ? `
        <div class="embed-author-wrap">
          ${embed.author.icon_url ? `<img class="embed-author-icon" src="${escapeHtml(embed.author.icon_url)}" alt="">` : ''}
          ${embed.author.url ? `<a href="${escapeHtml(embed.author.url)}" target="_blank" class="embed-author-name">${escapeHtml(embed.author.name)}</a>` : `<span class="embed-author-name">${escapeHtml(embed.author.name)}</span>`}
        </div>` : '';

      const titleHtml = embed.title ? `
        <div class="embed-title">
          ${embed.url ? `<a href="${escapeHtml(embed.url)}" target="_blank" class="embed-title-link">${escapeHtml(embed.title)}</a>` : escapeHtml(embed.title)}
        </div>` : '';

      const descHtml = embed.description ? `<div class="embed-desc">${parseMarkdown(embed.description)}</div>` : '';

      const thumbHtml = embed.thumbnail && embed.thumbnail.url ? `
        <div class="embed-thumb-wrap">
          <img class="embed-thumb-img" src="${escapeHtml(embed.thumbnail.url)}" alt="thumbnail" loading="lazy">
        </div>` : '';

      let fieldsHtml = '';
      if (embed.fields && embed.fields.length > 0) {
        fieldsHtml = `<div class="embed-fields-grid">` + embed.fields.map(f => `
          <div class="embed-field">
            <span class="embed-field-name">${escapeHtml(f.name)}</span>
            <span class="embed-field-value">${parseMarkdown(f.value)}</span>
          </div>
        `).join('') + `</div>`;
      }

      const imgHtml = embed.image && embed.image.url ? `
        <div class="embed-image-wrap">
          <img src="${escapeHtml(embed.image.url)}" alt="embed image" loading="lazy">
        </div>` : '';

      const footerHtml = embed.footer && embed.footer.text ? `
        <div class="embed-footer-wrap">
          ${embed.footer.icon_url ? `<img class="embed-footer-icon" src="${escapeHtml(embed.footer.icon_url)}" alt="">` : ''}
          <span class="embed-footer">${escapeHtml(embed.footer.text)}</span>
        </div>` : '';

      return `
        <div class="msg-embed" style="${colorStyle}">
          ${thumbHtml}
          ${authorHtml}
          ${titleHtml}
          ${descHtml}
          ${fieldsHtml}
          ${imgHtml}
          ${footerHtml}
        </div>
      `;
    }).join('');
  }

  row.innerHTML = `
    <img class="msg-avatar" src="${avatarUrl}" alt="${escapeHtml(author.username)}">
    <div class="msg-content-wrap">
      <div class="msg-header">
        <span class="msg-author ${author.bot ? 'is-bot' : ''}">${escapeHtml(author.username)}</span>
        <span class="msg-time">${timeStr}</span>
      </div>
      ${msg.content ? `<div class="msg-text">${parseMarkdown(msg.content)}</div>` : ''}
      ${attachmentsHtml}
      ${embedsHtml}
    </div>
  `;

  const authorEl = row.querySelector('.msg-author');
  const avatarEl = row.querySelector('.msg-avatar');
  [authorEl, avatarEl].forEach(el => {
    if (el) {
      el.addEventListener('click', () => {
        showUserProfile(author, null);
      });
    }
  });

  messagesFeed.appendChild(row);
}

// Send Message
btnSendMessage.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

async function handleSendMessage() {
  const content = messageInput.value.trim();
  if (!content || !state.currentChannel) return;

  messageInput.value = '';

  try {
    const res = await fetch(apiUrl(`/channels/${state.currentChannel.id}/messages`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Send failed: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Send error: ${err.message}`);
  }
}

// Disconnect / Close Active Session
btnLogout.addEventListener('click', async () => {
  closeTab(activeSessionId);
});

// Markdown Parser (Zero-dependency custom lightweight parser)
function parseMarkdown(text) {
  if (!text) return '';
  let str = escapeHtml(text);

  // Fenced code blocks
  str = str.replace(/```([a-z0-9]*)\n?([\s\S]*?)```/gi, '<pre><code>$2</code></pre>');

  // Inline code
  str = str.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  str = str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: var(--text-link); text-decoration: underline;">$1</a>');

  // Newlines
  str = str.replace(/\n/g, '<br>');

  return str;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Title Bar & Quick Exit Controls
const titlebarClose = document.getElementById('titlebar-close');
const btnQuickExit = document.getElementById('btn-quick-exit');
const titlebarMin = document.getElementById('titlebar-min');
const titlebarMax = document.getElementById('titlebar-max');

async function handleAppQuit() {
  try { await fetch('/api/exit', { method: 'POST' }); } catch(e) {}
  window.close();
}

if (titlebarClose) {
  titlebarClose.addEventListener('click', handleAppQuit);
}
if (btnQuickExit) {
  btnQuickExit.addEventListener('click', handleAppQuit);
}

if (titlebarMax) {
  titlebarMax.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  });
}

if (titlebarMin) {
  titlebarMin.addEventListener('click', () => {
    // Standard webview minimize hint
    window.blur();
  });
}

// Bot Info & Settings Dashboard
const btnHome = document.getElementById('btn-home');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSettingsDone = document.getElementById('btn-settings-done');
const btnSettingsLogout = document.getElementById('btn-settings-logout');

function openSettingsModal() {
  const sess = getCurrentSession();
  if (!sess || !sess.bot) return;

  const avatarUrl = sess.bot.avatar
    ? `https://cdn.discordapp.com/avatars/${sess.bot.id}/${sess.bot.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  const sAvatar = document.getElementById('settings-bot-avatar');
  const sName = document.getElementById('settings-bot-name');
  const sId = document.getElementById('settings-bot-id');
  const sServers = document.getElementById('settings-servers-count');
  const pStatus = document.getElementById('presence-status-select');
  const pType = document.getElementById('presence-activity-type');
  const pText = document.getElementById('presence-activity-text');

  if (sAvatar) sAvatar.src = avatarUrl;
  if (sName) sName.textContent = sess.bot.username;
  if (sId) sId.textContent = sess.bot.id;
  if (sServers) sServers.textContent = sess.guilds ? sess.guilds.length : 0;
  if (pStatus) pStatus.value = sess.status || 'online';
  if (pType) pType.value = sess.activity ? sess.activity.type : 0;
  if (pText) pText.value = (sess.activity && sess.activity.text) || '';

  if (settingsModal) settingsModal.style.display = 'flex';
}

if (btnHome) {
  btnHome.addEventListener('click', openSettingsModal);
}

const btnUpdatePresence = document.getElementById('btn-update-presence');
if (btnUpdatePresence) {
  btnUpdatePresence.addEventListener('click', async () => {
    const sess = getCurrentSession();
    if (!sess || !sess.bot || !sess.id || sess.id.startsWith('temp-')) return;

    const pStatus = document.getElementById('presence-status-select');
    const pType = document.getElementById('presence-activity-type');
    const pText = document.getElementById('presence-activity-text');

    const statusVal = pStatus ? pStatus.value : 'online';
    const typeVal = pType ? parseInt(pType.value, 10) : 0;
    const textVal = pText ? pText.value.trim() : '';

    try {
      btnUpdatePresence.disabled = true;
      btnUpdatePresence.textContent = 'Updating...';

      const res = await fetch(`/api/sessions/${sess.id}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusVal,
          activity_type: typeVal,
          activity_name: textVal || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert('Failed to update presence: ' + (err.error || 'Unknown error'));
      } else {
        sess.status = statusVal;
        sess.activity = { type: typeVal, text: textVal };
        updateStatusDotUI(statusVal);
        renderTabs();
        btnUpdatePresence.textContent = 'Updated!';
        setTimeout(() => {
          btnUpdatePresence.textContent = 'Set Status';
          btnUpdatePresence.disabled = false;
        }, 1500);
      }
    } catch (e) {
      alert('Error updating presence: ' + e.message);
      btnUpdatePresence.disabled = false;
      btnUpdatePresence.textContent = 'Set Status';
    }
  });
}

const botFooterEl = document.querySelector('.bot-profile-footer');
if (botFooterEl) {
  botFooterEl.addEventListener('click', (e) => {
    if (e.target.closest('#btn-logout') || e.target.closest('#quick-status-select')) return;
    openSettingsModal();
  });
}

const btnOpenSettings = document.getElementById('btn-open-settings');
if (btnOpenSettings) {
  btnOpenSettings.addEventListener('click', openSettingsModal);
}

const quickStatusSelect = document.getElementById('quick-status-select');
if (quickStatusSelect) {
  quickStatusSelect.addEventListener('change', async () => {
    const sess = getCurrentSession();
    if (!sess || !sess.id || sess.id.startsWith('temp-')) return;
    const newStatus = quickStatusSelect.value;
    try {
      await fetch(`/api/sessions/${sess.id}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          activity_type: sess.activity ? sess.activity.type : 0,
          activity_name: sess.activity ? sess.activity.text : undefined
        })
      });
      sess.status = newStatus;
      updateStatusDotUI(newStatus);
      renderTabs();
    } catch (e) {
      console.error('Failed to update presence via quick selector:', e);
    }
  });
}

const channelSearchInput = document.getElementById('channel-search-input');
if (channelSearchInput) {
  channelSearchInput.addEventListener('input', () => {
    const query = channelSearchInput.value.trim().toLowerCase();
    const items = channelsList.querySelectorAll('.channel-item');
    items.forEach(item => {
      const name = item.querySelector('.channel-name')?.textContent.toLowerCase() || '';
      item.style.display = (!query || name.includes(query)) ? 'flex' : 'none';
    });
  });
}

[btnCloseSettings, btnSettingsDone].forEach((btn) => {
  if (btn) {
    btn.addEventListener('click', () => {
      if (settingsModal) settingsModal.style.display = 'none';
    });
  }
});

if (btnSettingsLogout) {
  btnSettingsLogout.addEventListener('click', () => {
    if (settingsModal) settingsModal.style.display = 'none';
    if (btnLogout) btnLogout.click();
  });
}

// Members Management (DMs intentionally disabled for privacy)
const membersSidebar = document.getElementById('members-sidebar');
const btnToggleMembers = document.getElementById('btn-toggle-members');
if (btnToggleMembers) {
  btnToggleMembers.addEventListener('click', () => {
    membersSidebar.classList.toggle('hidden');
  });
}

async function fetchMembers(guildId) {
  try {
    const res = await fetch(apiUrl(`/guilds/${guildId}/members`));
    const data = await res.json();
    state.members = data.members || [];
    renderMembers();
  } catch (err) {
    console.error('Failed to load members:', err);
  }
}

function renderMembers() {
  const membersList = document.getElementById('members-list');
  const membersCount = document.getElementById('members-count');
  if (!membersList) return;

  membersList.innerHTML = '';
  if (membersCount) membersCount.textContent = state.members.length;

  if (state.members.length === 0) {
    membersList.innerHTML = '<div class="members-empty">No members loaded.</div>';
    return;
  }

  state.members.forEach((member) => {
    const user = member.user || { username: 'Unknown', id: '0' };
    const div = document.createElement('div');
    div.className = 'member-item';

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const displayName = member.nick || user.global_name || user.username;

    div.innerHTML = `
      <div class="member-avatar-wrap">
        <img class="member-avatar" src="${avatarUrl}" alt="${escapeHtml(displayName)}">
      </div>
      <div class="member-info">
        <span class="member-name">${escapeHtml(displayName)}</span>
      </div>
    `;

    div.addEventListener('click', () => {
      showUserProfile(user, member);
    });

    membersList.appendChild(div);
  });
}

// Embed Builder & Slash Command (/embed)
const embedModal = document.getElementById('embed-modal');
const btnOpenEmbedModal = document.getElementById('btn-open-embed-modal');
const btnCloseEmbedModal = document.getElementById('btn-close-embed-modal');
const btnCancelEmbed = document.getElementById('btn-cancel-embed');
const btnSendEmbed = document.getElementById('btn-send-embed');

const embedTitleInput = document.getElementById('embed-title');
const embedDescInput = document.getElementById('embed-desc');
const embedColorInput = document.getElementById('embed-color');
const embedColorHex = document.getElementById('embed-color-hex');
const embedAuthorInput = document.getElementById('embed-author');
const embedFooterInput = document.getElementById('embed-footer');
const embedImageInput = document.getElementById('embed-image');

const previewAuthor = document.getElementById('preview-author');
const previewTitle = document.getElementById('preview-title');
const previewDesc = document.getElementById('preview-desc');
const previewImageWrap = document.getElementById('preview-image-wrap');
const previewImage = document.getElementById('preview-image');
const previewFooter = document.getElementById('preview-footer');
const embedLivePreview = document.getElementById('embed-live-preview');

function updateEmbedPreview() {
  const authorVal = embedAuthorInput ? embedAuthorInput.value.trim() : '';
  const titleVal = embedTitleInput ? embedTitleInput.value.trim() : '';
  const descVal = embedDescInput ? embedDescInput.value.trim() : '';
  const colorVal = embedColorInput ? embedColorInput.value : '#5865f2';
  const imageVal = embedImageInput ? embedImageInput.value.trim() : '';
  const footerVal = embedFooterInput ? embedFooterInput.value.trim() : '';

  if (previewAuthor) {
    if (authorVal) {
      previewAuthor.textContent = authorVal;
      previewAuthor.style.display = 'block';
    } else {
      previewAuthor.style.display = 'none';
    }
  }

  if (previewTitle) {
    previewTitle.textContent = titleVal || 'Embed Title';
  }

  if (previewDesc) {
    previewDesc.innerHTML = descVal ? parseMarkdown(descVal) : 'Embed description preview will appear here.';
  }

  if (previewImageWrap && previewImage) {
    if (imageVal) {
      previewImage.src = imageVal;
      previewImageWrap.style.display = 'block';
    } else {
      previewImageWrap.style.display = 'none';
    }
  }

  if (previewFooter) {
    if (footerVal) {
      previewFooter.textContent = footerVal;
      previewFooter.style.display = 'block';
    } else {
      previewFooter.style.display = 'none';
    }
  }

  if (embedLivePreview) embedLivePreview.style.borderLeftColor = colorVal;
  if (embedColorHex) embedColorHex.textContent = colorVal;
}

[embedTitleInput, embedDescInput, embedColorInput, embedAuthorInput, embedFooterInput, embedImageInput].forEach((el) => {
  if (el) el.addEventListener('input', updateEmbedPreview);
});

if (btnOpenEmbedModal) {
  btnOpenEmbedModal.addEventListener('click', () => {
    embedModal.style.display = 'flex';
    updateEmbedPreview();
    embedTitleInput.focus();
  });
}

[btnCloseEmbedModal, btnCancelEmbed].forEach((btn) => {
  if (btn) {
    btn.addEventListener('click', () => {
      embedModal.style.display = 'none';
    });
  }
});

// Trigger /embed and Auto-Resize on input
messageInput.addEventListener('input', () => {
  // Auto-resize textarea height responsively
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + 'px';

  if (messageInput.value.trim().toLowerCase() === '/embed') {
    messageInput.value = '';
    messageInput.style.height = 'auto';
    if (btnOpenEmbedModal) btnOpenEmbedModal.click();
  }
});

if (btnSendEmbed) {
  btnSendEmbed.addEventListener('click', async () => {
    if (!state.currentChannel) {
      alert('Please select a channel first.');
      return;
    }

    const title = embedTitleInput.value.trim();
    const desc = embedDescInput.value.trim();
    if (!title && !desc) {
      alert('Please enter at least a title or description for the embed.');
      return;
    }

    const colorHex = embedColorInput.value.replace('#', '');
    const colorInt = parseInt(colorHex, 16);

    const embedObj = {
      title: title || undefined,
      description: desc || undefined,
      color: isNaN(colorInt) ? undefined : colorInt,
      author: embedAuthorInput.value.trim() ? { name: embedAuthorInput.value.trim() } : undefined,
      footer: embedFooterInput.value.trim() ? { text: embedFooterInput.value.trim() } : undefined,
      image: embedImageInput.value.trim() ? { url: embedImageInput.value.trim() } : undefined
    };

    try {
      const res = await fetch(apiUrl(`/channels/${state.currentChannel.id}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embedObj] })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Send failed: ${data.error || 'Unknown error'}`);
      } else {
        embedModal.style.display = 'none';
        embedTitleInput.value = '';
        embedDescInput.value = '';
        embedAuthorInput.value = '';
        embedFooterInput.value = '';
        embedImageInput.value = '';
      }
    } catch (err) {
      alert(`Send error: ${err.message}`);
    }
  });
}

// User Profile Modal
const userProfileModal = document.getElementById('user-profile-modal');
const btnCloseProfile = document.getElementById('btn-close-profile');
const profileAvatar = document.getElementById('profile-avatar');
const profileDisplayName = document.getElementById('profile-display-name');
const profileHandle = document.getElementById('profile-handle');
const profileBadges = document.getElementById('profile-badges');
const profileCreatedDate = document.getElementById('profile-created-date');
const profileJoinedWrap = document.getElementById('profile-joined-wrap');
const profileJoinedDate = document.getElementById('profile-joined-date');
const profileUserId = document.getElementById('profile-user-id');
const btnCopyUserId = document.getElementById('btn-copy-user-id');
const profileRolesWrap = document.getElementById('profile-roles-wrap');
const profileRolesList = document.getElementById('profile-roles-list');

function showUserProfile(user, member) {
  if (!user || !userProfileModal) return;

  const displayName = (member && member.nick) || user.global_name || user.username || 'Unknown';
  const handle = user.discriminator && user.discriminator !== '0'
    ? `@${user.username}#${user.discriminator}`
    : `@${user.username}`;

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  if (profileAvatar) profileAvatar.src = avatarUrl;
  if (profileDisplayName) profileDisplayName.textContent = displayName;
  if (profileHandle) profileHandle.textContent = handle;
  if (profileUserId) profileUserId.textContent = user.id;

  // Snowflake calculation: (id >> 22) + 1420070400000
  try {
    const epoch = 1420070400000n;
    const createdAtMs = Number((BigInt(user.id) >> 22n) + epoch);
    if (profileCreatedDate) {
      profileCreatedDate.textContent = new Date(createdAtMs).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (e) {
    if (profileCreatedDate) profileCreatedDate.textContent = 'Unknown';
  }

  // Guild join date
  if (member && member.joined_at && profileJoinedDate && profileJoinedWrap) {
    profileJoinedDate.textContent = new Date(member.joined_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    profileJoinedWrap.style.display = 'flex';
  } else if (profileJoinedWrap) {
    profileJoinedWrap.style.display = 'none';
  }

  // Badges
  if (profileBadges) {
    profileBadges.innerHTML = '';
    if (user.bot) {
      profileBadges.innerHTML += '<span class="profile-badge">BOT</span>';
    }
  }

  // Member roles
  if (member && member.roles && member.roles.length > 0 && profileRolesList && profileRolesWrap) {
    profileRolesList.innerHTML = member.roles.map(r => `
      <span class="profile-role-pill">
        <span class="profile-role-dot"></span>Role
      </span>
    `).join('');
    profileRolesWrap.style.display = 'flex';
  } else if (profileRolesWrap) {
    profileRolesWrap.style.display = 'none';
  }

  userProfileModal.style.display = 'flex';
}

if (btnCloseProfile) {
  btnCloseProfile.addEventListener('click', () => {
    if (userProfileModal) userProfileModal.style.display = 'none';
  });
}

if (userProfileModal) {
  userProfileModal.addEventListener('click', (e) => {
    if (e.target === userProfileModal) {
      userProfileModal.style.display = 'none';
    }
  });
}

if (btnCopyUserId) {
  btnCopyUserId.addEventListener('click', () => {
    if (profileUserId && profileUserId.textContent) {
      navigator.clipboard.writeText(profileUserId.textContent);
      btnCopyUserId.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyUserId.textContent = 'Copy ID';
      }, 1500);
    }
  });
}

// Initialize Initial Tab
createTab('New Session');

