import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get, push, set, query, orderByChild, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKqwpql2Yl0kbpUIPrQUYyVd7m1OeH-D8",
  authDomain: "triflex-a08c7.firebaseapp.com",
  projectId: "triflex-a08c7",
  storageBucket: "triflex-a08c7.firebasestorage.app",
  messagingSenderId: "835381689765",
  appId: "1:835381689765:web:e0be4b22e5f35ca1e0bc4c",
  databaseURL: "https://triflex-a08c7-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUserProfile = null;
let currentChannel = "global";
let unsubscribeMessages = null;
let allVisibleMessages = [];
let isOpen = false;
let unreadCount = 0;
let seenMessageIds = new Set();
let hasInitialLoad = false;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

const STORAGE_KEY = "triflex_seen_chat_messages";
const STORAGE_INIT_KEY = "triflex_seen_chat_initialized";

const emojis = ["😀", "😄", "😂", "👍", "✅", "🚚", "📍", "👀", "🔥", "❤️", "🎉", "⚠️", "❗", "🙏", "👌", "💪"];

try {
  seenMessageIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
} catch {
  seenMessageIds = new Set();
}

const companyNames = {
  tsoslo: "Transportsentralen Oslo",
  tsoslobud: "TS Oslo Budtjenester",
  mtf: "Moss Transportforum",
  blakurer: "Blå Kurér"
};

function normalizeCompany(company) {
  if (!company) return "";
  const value = String(company).toLowerCase().trim();

  if (value === "tsoslo" || value.includes("transportsentralen oslo")) return "tsoslo";
  if (value === "tsoslobud" || value.includes("ts oslo budtjenester") || value.includes("tsbud")) return "tsoslobud";
  if (value === "mtf" || value.includes("moss transportforum")) return "mtf";
  if (value === "blakurer" || value.includes("blå kurér") || value.includes("bla-kurer") || value.includes("bla kur")) return "blakurer";

  return value;
}

function getAllowedCompanyKeys(userData) {
  if ((userData.role || "user") === "superadmin") return ["all"];

  if (Array.isArray(userData.companyKeys) && userData.companyKeys.length) {
    return userData.companyKeys.map(normalizeCompany).filter(Boolean);
  }

  if (userData.companyKeys && typeof userData.companyKeys === "object") {
    return Object.values(userData.companyKeys).map(normalizeCompany).filter(Boolean);
  }

  const single = normalizeCompany(userData.companyKey || userData.company || "");
  return single ? [single] : [];
}

function companyLabel(key) {
  return companyNames[key] || key || "Ukjent";
}

function getEmailName(email) {
  if (!email) return "Ukjent";
  return String(email).split("@")[0] || email;
}

function getDisplayNameFromUserData(userData, fallbackEmail) {
  return (
    userData.displayName ||
    userData.name ||
    userData.fullName ||
    userData.contactName ||
    getEmailName(userData.email || fallbackEmail)
  );
}

function getMessageDisplayName(message) {
  return (
    message.displayName ||
    message.senderName ||
    message.name ||
    getEmailName(message.email)
  );
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function canSeeMessage(message) {
  if (!currentUserProfile) return false;
  if (message.channel === "global") return true;
  if (currentUserProfile.role === "superadmin") return true;

  const keys = Array.isArray(message.companyKeys)
    ? message.companyKeys.map(normalizeCompany)
    : [normalizeCompany(message.companyKey || "")];

  return keys.some(key => currentUserProfile.allowedCompanyKeys.includes(key));
}

function persistSeenMessages() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenMessageIds].slice(-1500)));
  localStorage.setItem(STORAGE_INIT_KEY, "true");
}

function injectStyles() {
  if (document.getElementById("triflexChatStyles")) return;

  const style = document.createElement("style");
  style.id = "triflexChatStyles";
  style.textContent = `
    .triflex-chat-bubble {
      position: fixed !important;
      right: 22px !important;
      bottom: 22px !important;
      width: 58px !important;
      height: 58px !important;
      border-radius: 50% !important;
      background: #023060 !important;
      color: white !important;
      border: none !important;
      font-size: 26px !important;
      cursor: pointer !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 18px rgba(0,0,0,0.6) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: 0.25s !important;
    }

    .triflex-chat-bubble:hover {
      background: #012448 !important;
      transform: translateY(-3px);
    }

    .triflex-chat-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 20px;
      height: 20px;
      border-radius: 999px;
      background: #FF4136;
      color: white;
      font-size: 12px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      box-sizing: border-box;
      line-height: 20px;
    }

    .triflex-chat-window {
      position: fixed !important;
      right: 22px !important;
      bottom: 92px !important;
      width: 390px !important;
      height: 540px !important;
      background: rgba(2,28,60,0.98) !important;
      color: white !important;
      border-radius: 14px !important;
      z-index: 2147483647 !important;
      display: none !important;
      box-shadow: 0 8px 28px rgba(0,0,0,0.65) !important;
      overflow: hidden !important;
      font-family: Poppins, sans-serif !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
    }

    .triflex-chat-window.open {
      display: flex !important;
      flex-direction: column !important;
    }

    .triflex-chat-header {
      background: #012448;
      padding: 12px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
    }

    .triflex-chat-header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .triflex-chat-header button {
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
    }

    .triflex-chat-tabs {
      display: flex;
      gap: 8px;
      padding: 10px;
      background: rgba(0,0,0,0.12);
    }

    .triflex-chat-tab {
      flex: 1;
      border: none;
      border-radius: 8px;
      padding: 8px;
      cursor: pointer;
      color: white;
      font-weight: 700;
      background: #023060;
      position: relative;
    }

    .triflex-chat-tab.active.global {
      background: #0074D9;
    }

    .triflex-chat-tab.active.internal {
      background: #2ECC40;
    }

    .triflex-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      background: rgba(0,0,0,0.12);
    }

    .triflex-chat-message {
      background: rgba(255,255,255,0.07);
      border-left: 4px solid #0074D9;
      border-radius: 9px;
      padding: 9px;
      margin-bottom: 10px;
      font-size: 13px;
    }

    .triflex-chat-message.internal {
      border-left-color: #2ECC40;
    }

    .triflex-chat-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 4px;
      font-size: 11px;
      color: #cfcfcf;
    }

    .triflex-chat-tag.global {
      color: #7FDBFF;
      font-weight: 800;
    }

    .triflex-chat-tag.internal {
      color: #2ECC40;
      font-weight: 800;
    }

    .triflex-chat-tag.admin {
      color: #FFDC00;
      font-weight: 800;
    }

    .triflex-chat-sender {
      color: #ffffff;
      font-weight: 700;
    }

    .triflex-chat-time {
      margin-left: auto;
      color: #9fb3c8;
    }

    .triflex-chat-text {
      white-space: pre-wrap;
      line-height: 1.4;
      color: #f2f6ff;
    }

    .triflex-chat-readline {
      margin-top: 7px;
      font-size: 11px;
      color: #9fb3c8;
      display: flex;
      justify-content: flex-end;
    }

    .triflex-chat-readbtn {
      background: transparent;
      color: #9fb3c8;
      border: none;
      cursor: pointer;
      padding: 0;
      font-size: 11px;
      font-family: Poppins, sans-serif;
    }

    .triflex-chat-readbtn:hover {
      color: #ffffff;
      text-decoration: underline;
    }

    .triflex-chat-input-area {
      display: flex;
      gap: 8px;
      padding: 10px;
      background: #012448;
      position: relative;
    }

    .triflex-chat-input {
      flex: 1;
      min-height: 40px;
      max-height: 90px;
      resize: none;
      border: none;
      border-radius: 8px;
      padding: 9px;
      background: #023060;
      color: white;
      font-family: Poppins, sans-serif;
      box-sizing: border-box;
      outline: none;
    }

    .triflex-chat-emoji {
      width: 40px;
      border: none;
      border-radius: 8px;
      background: #023060;
      color: white;
      font-size: 18px;
      cursor: pointer;
    }

    .triflex-chat-send {
      width: 74px;
      border: none;
      border-radius: 8px;
      background: #0074D9;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    .triflex-chat-send:hover {
      background: #005fa3;
    }

    .triflex-chat-emoji-panel {
      position: absolute;
      bottom: 62px;
      left: 10px;
      right: 10px;
      background: #012448;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 8px;
      display: none;
      grid-template-columns: repeat(8, 1fr);
      gap: 5px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.45);
    }

    .triflex-chat-emoji-panel.open {
      display: grid;
    }

    .triflex-chat-emoji-choice {
      background: #023060;
      border: none;
      border-radius: 8px;
      padding: 7px 0;
      font-size: 18px;
      cursor: pointer;
    }

    .triflex-chat-empty {
      color: #cfcfcf;
      text-align: center;
      margin-top: 30px;
      font-size: 13px;
      line-height: 1.4;
    }

    .triflex-read-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: Poppins, sans-serif;
    }

    .triflex-read-overlay.open {
      display: flex;
    }

    .triflex-read-modal {
      width: 320px;
      max-width: calc(100vw - 30px);
      max-height: 420px;
      background: rgba(2,28,60,0.98);
      color: white;
      border-radius: 14px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.65);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    }

    .triflex-read-header {
      background: #012448;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
    }

    .triflex-read-header button {
      background: transparent;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
    }

    .triflex-read-list {
      padding: 12px;
      overflow-y: auto;
      max-height: 350px;
    }

    .triflex-read-person {
      padding: 8px;
      border-radius: 8px;
      background: rgba(255,255,255,0.07);
      margin-bottom: 7px;
      font-size: 13px;
    }

    .triflex-read-time {
      color: #9fb3c8;
      font-size: 11px;
      margin-top: 2px;
    }

    @media (max-width: 520px) {
      .triflex-chat-window {
        width: calc(100vw - 24px) !important;
        height: 70vh !important;
        right: 12px !important;
        bottom: 88px !important;
        left: auto !important;
        top: auto !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function injectWidget() {
  if (document.getElementById("triflexChatBubble")) return;

  injectStyles();

  const bubble = document.createElement("button");
  bubble.className = "triflex-chat-bubble";
  bubble.id = "triflexChatBubble";
  bubble.title = "Åpne chat";
  bubble.innerHTML = `💬<span class="triflex-chat-badge" id="triflexChatBadge">0</span>`;

  const chatWindow = document.createElement("div");
  chatWindow.className = "triflex-chat-window";
  chatWindow.id = "triflexChatWindow";

  chatWindow.innerHTML = `
    <div class="triflex-chat-header" id="triflexChatHeader">
      <strong>Triflex Chat</strong>
      <div class="triflex-chat-header-actions">
        <button id="triflexChatMinimize" title="Minimer">−</button>
        <button id="triflexChatClose" title="Lukk">×</button>
      </div>
    </div>

    <div class="triflex-chat-tabs">
      <button class="triflex-chat-tab global active" id="triflexGlobalTab">Konsern</button>
      <button class="triflex-chat-tab internal" id="triflexInternalTab">Intern</button>
    </div>

    <div class="triflex-chat-messages" id="triflexChatMessages">
      <div class="triflex-chat-empty">Laster chat...</div>
    </div>

    <div class="triflex-chat-input-area">
      <div class="triflex-chat-emoji-panel" id="triflexEmojiPanel"></div>
      <button class="triflex-chat-emoji" id="triflexEmojiBtn" title="Emoji">😀</button>
      <textarea class="triflex-chat-input" id="triflexChatInput" placeholder="Skriv melding..."></textarea>
      <button class="triflex-chat-send" id="triflexChatSend">Send</button>
    </div>
  `;

  const readOverlay = document.createElement("div");
  readOverlay.className = "triflex-read-overlay";
  readOverlay.id = "triflexReadOverlay";
  readOverlay.innerHTML = `
    <div class="triflex-read-modal">
      <div class="triflex-read-header">
        <span>Lest av</span>
        <button id="triflexReadClose">×</button>
      </div>
      <div class="triflex-read-list" id="triflexReadList"></div>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(chatWindow);
  document.body.appendChild(readOverlay);

  restoreWindowPosition(chatWindow);

  renderEmojiPanel();

  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    openChat();
  });

  document.getElementById("triflexChatClose").addEventListener("click", () => closeChat());
  document.getElementById("triflexChatMinimize").addEventListener("click", () => closeChat());

  document.getElementById("triflexGlobalTab").addEventListener("click", () => setChannel("global"));
  document.getElementById("triflexInternalTab").addEventListener("click", () => setChannel("internal"));
  document.getElementById("triflexChatSend").addEventListener("click", sendMessage);
  document.getElementById("triflexEmojiBtn").addEventListener("click", toggleEmojiPanel);

  document.getElementById("triflexReadClose").addEventListener("click", closeReadModal);
  document.getElementById("triflexReadOverlay").addEventListener("click", e => {
    if (e.target.id === "triflexReadOverlay") closeReadModal();
  });

  document.getElementById("triflexChatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  makeDraggable(chatWindow, document.getElementById("triflexChatHeader"));
}

function renderEmojiPanel() {
  const panel = document.getElementById("triflexEmojiPanel");
  if (!panel) return;

  panel.innerHTML = "";
  emojis.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "triflex-chat-emoji-choice";
    btn.textContent = emoji;
    btn.addEventListener("click", () => insertEmoji(emoji));
    panel.appendChild(btn);
  });
}

function toggleEmojiPanel() {
  const panel = document.getElementById("triflexEmojiPanel");
  if (panel) panel.classList.toggle("open");
}

function insertEmoji(emoji) {
  const input = document.getElementById("triflexChatInput");
  const panel = document.getElementById("triflexEmojiPanel");
  if (!input) return;

  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const before = input.value.substring(0, start);
  const after = input.value.substring(end);

  input.value = before + emoji + after;
  input.focus();
  input.selectionStart = input.selectionEnd = start + emoji.length;

  if (panel) panel.classList.remove("open");
}

function openChat() {
  const chatWindow = document.getElementById("triflexChatWindow");
  chatWindow.classList.add("open");
  isOpen = true;
  markCurrentChannelAsRead();
  renderMessagesForCurrentChannel();
}

function closeChat() {
  const chatWindow = document.getElementById("triflexChatWindow");
  chatWindow.classList.remove("open");
  isOpen = false;
  calculateUnreadCount();
}

function updateBadge() {
  const badge = document.getElementById("triflexChatBadge");
  if (!badge) return;

  if (unreadCount > 0) {
    badge.style.display = "flex";
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  } else {
    badge.style.display = "none";
    badge.textContent = "0";
  }
}

function setChannel(channel) {
  currentChannel = channel;

  document.getElementById("triflexGlobalTab").classList.toggle("active", channel === "global");
  document.getElementById("triflexInternalTab").classList.toggle("active", channel === "internal");

  document.getElementById("triflexChatInput").placeholder =
    channel === "global"
      ? "Skriv til alle i konsernet..."
      : "Skriv intern melding...";

  markCurrentChannelAsRead();
  renderMessagesForCurrentChannel();
}

function startMessageListener() {
  if (!currentUserProfile) return;

  if (unsubscribeMessages) unsubscribeMessages();

  const messagesQuery = query(
    ref(db, "chatMessages"),
    orderByChild("createdAt"),
    limitToLast(500)
  );

  unsubscribeMessages = onValue(messagesQuery, snapshot => {
    const messages = [];

    if (snapshot.exists()) {
      const data = snapshot.val();

      for (const id in data) {
        const message = { id, ...data[id] };
        if (canSeeMessage(message)) messages.push(message);
      }
    }

    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    allVisibleMessages = messages;

    if (!hasInitialLoad) {
      const initialized = localStorage.getItem(STORAGE_INIT_KEY) === "true";

      if (!initialized) {
        messages.forEach(message => seenMessageIds.add(message.id));
        persistSeenMessages();
      }

      hasInitialLoad = true;
    }

    if (isOpen) {
      markCurrentChannelAsRead();
    }

    calculateUnreadCount();
    renderMessagesForCurrentChannel();
  }, error => {
    console.error("Feil ved lasting av chat:", error);
    const box = document.getElementById("triflexChatMessages");
    if (box) box.innerHTML = `<div class="triflex-chat-empty">Kunne ikke laste chat.<br>${escapeHtml(error.message)}</div>`;
  });
}

function calculateUnreadCount() {
  if (!currentUserProfile) {
    unreadCount = 0;
    updateBadge();
    return;
  }

  unreadCount = allVisibleMessages.filter(message => {
    if (message.uid === currentUserProfile.uid) return false;
    if (message.readBy && message.readBy[currentUserProfile.uid]) return false;
    if (seenMessageIds.has(message.id)) return false;
    return true;
  }).length;

  updateBadge();
}

async function markMessageAsRead(message) {
  if (!currentUserProfile || !message || !message.id) return;
  if (message.uid === currentUserProfile.uid) return;
  if (message.readBy && message.readBy[currentUserProfile.uid]) return;

  seenMessageIds.add(message.id);
  persistSeenMessages();

  try {
    await set(ref(db, `chatMessages/${message.id}/readBy/${currentUserProfile.uid}`), {
      name: currentUserProfile.displayName,
      email: currentUserProfile.email,
      readAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Kunne ikke markere melding som lest:", error);
  }
}

function markCurrentChannelAsRead() {
  if (!currentUserProfile) return;

  const messages = allVisibleMessages.filter(message => message.channel === currentChannel);
  messages.forEach(message => {
    if (message.uid !== currentUserProfile.uid) {
      markMessageAsRead(message);
    }
  });

  calculateUnreadCount();
}

function getReadByList(message) {
  const readBy = message.readBy || {};
  return Object.keys(readBy)
    .map(uid => ({
      uid,
      name: readBy[uid]?.name || getEmailName(readBy[uid]?.email) || "Ukjent",
      email: readBy[uid]?.email || "",
      readAt: readBy[uid]?.readAt || ""
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "no"));
}

function openReadModal(messageId) {
  const message = allVisibleMessages.find(m => m.id === messageId);
  if (!message) return;

  const overlay = document.getElementById("triflexReadOverlay");
  const list = document.getElementById("triflexReadList");
  const readers = getReadByList(message);

  if (!overlay || !list) return;

  if (!readers.length) {
    list.innerHTML = `<div class="triflex-chat-empty">Ingen har lest meldingen enda.</div>`;
  } else {
    list.innerHTML = readers.map(reader => `
      <div class="triflex-read-person">
        <strong>${escapeHtml(reader.name)}</strong>
        <div class="triflex-read-time">${formatTime(reader.readAt)}</div>
      </div>
    `).join("");
  }

  overlay.classList.add("open");
}

function closeReadModal() {
  const overlay = document.getElementById("triflexReadOverlay");
  if (overlay) overlay.classList.remove("open");
}

function renderMessagesForCurrentChannel() {
  const box = document.getElementById("triflexChatMessages");
  if (!box) return;

  if (!currentUserProfile) {
    box.innerHTML = `<div class="triflex-chat-empty">Logger inn chat...</div>`;
    return;
  }

  const messages = allVisibleMessages.filter(message => message.channel === currentChannel);

  box.innerHTML = "";

  if (!messages.length) {
    box.innerHTML = `<div class="triflex-chat-empty">Ingen meldinger her enda.</div>`;
    return;
  }

  messages.forEach(message => {
    const div = document.createElement("div");
    div.className = `triflex-chat-message ${message.channel === "internal" ? "internal" : "global"}`;

    const tag = message.channel === "global" ? "KONSERN" : "INTERN";
    const tagClass = message.channel === "global" ? "global" : "internal";

    const roleTag = ["admin", "superadmin"].includes(message.role)
      ? `<span class="triflex-chat-tag admin">${message.role === "superadmin" ? "SUPERADMIN" : "ADMIN"}</span>`
      : "";

    const companyText = message.channel === "internal"
      ? (Array.isArray(message.companyKeys)
          ? message.companyKeys.map(companyLabel).join(", ")
          : companyLabel(message.companyKey))
      : "Alle";

    const readCount = getReadByList(message).length;

    div.innerHTML = `
      <div class="triflex-chat-meta">
        <span class="triflex-chat-tag ${tagClass}">[${tag}]</span>
        ${roleTag}
        <span class="triflex-chat-sender">${escapeHtml(getMessageDisplayName(message))}</span>
        <span>${escapeHtml(companyText)}</span>
        <span class="triflex-chat-time">${formatTime(message.createdAt)}</span>
      </div>
      <div class="triflex-chat-text">${escapeHtml(message.text)}</div>
      <div class="triflex-chat-readline">
        <button class="triflex-chat-readbtn" data-message-id="${escapeHtml(message.id)}">👁 ${readCount} lest</button>
      </div>
    `;

    box.appendChild(div);
  });

  document.querySelectorAll(".triflex-chat-readbtn").forEach(btn => {
    btn.addEventListener("click", e => {
      openReadModal(e.currentTarget.dataset.messageId);
    });
  });

  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("triflexChatInput");
  const sendBtn = document.getElementById("triflexChatSend");
  const text = input.value.trim();

  if (!currentUserProfile) {
    alert("Chatten er ikke klar enda.");
    return;
  }

  if (!text) return;

  sendBtn.disabled = true;

  try {
    const messageRef = push(ref(db, "chatMessages"));
    const now = new Date().toISOString();

    await set(messageRef, {
      channel: currentChannel,
      text,
      uid: currentUserProfile.uid,
      email: currentUserProfile.email,
      displayName: currentUserProfile.displayName,
      role: currentUserProfile.role,
      companyKey: currentUserProfile.primaryCompanyKey,
      companyKeys: currentUserProfile.allowedCompanyKeys,
      companyName: currentUserProfile.companyName,
      createdAt: now,
      readBy: {
        [currentUserProfile.uid]: {
          name: currentUserProfile.displayName,
          email: currentUserProfile.email,
          readAt: now
        }
      }
    });

    input.value = "";
  } catch (error) {
    console.error("Feil ved sending av chatmelding:", error);
    alert("Kunne ikke sende melding.\n\n" + error.message);
  } finally {
    sendBtn.disabled = false;
  }
}

function makeDraggable(windowEl, handle) {
  handle.addEventListener("mousedown", e => {
    if (window.innerWidth <= 520) return;

    isDragging = true;

    const rect = windowEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    windowEl.style.right = "auto";
    windowEl.style.bottom = "auto";
    windowEl.style.left = rect.left + "px";
    windowEl.style.top = rect.top + "px";
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;

    const maxLeft = window.innerWidth - windowEl.offsetWidth;
    const maxTop = window.innerHeight - windowEl.offsetHeight;

    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));

    windowEl.style.left = left + "px";
    windowEl.style.top = top + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    saveWindowPosition(windowEl);
  });
}

function saveWindowPosition(windowEl) {
  const rect = windowEl.getBoundingClientRect();
  localStorage.setItem("triflexChatPosition", JSON.stringify({
    left: rect.left,
    top: rect.top
  }));
}

function restoreWindowPosition(windowEl) {
  try {
    const saved = JSON.parse(localStorage.getItem("triflexChatPosition"));
    if (!saved || window.innerWidth <= 520) return;

    windowEl.style.right = "auto";
    windowEl.style.bottom = "auto";
    windowEl.style.left = saved.left + "px";
    windowEl.style.top = saved.top + "px";
  } catch {}
}

injectWidget();

onAuthStateChanged(auth, async user => {
  if (!user) return;

  const snapshot = await get(ref(db, "users/" + user.uid));
  if (!snapshot.exists()) return;

  const userData = snapshot.val();

  if (userData.active === false || userData.approved !== true) return;

  const allowedCompanyKeys = getAllowedCompanyKeys(userData);
  const primaryCompanyKey = normalizeCompany(userData.companyKey || userData.company || allowedCompanyKeys[0] || "");
  const displayName = getDisplayNameFromUserData(userData, user.email);

  currentUserProfile = {
    uid: user.uid,
    email: userData.email || user.email || "",
    displayName,
    role: userData.role || "user",
    primaryCompanyKey,
    allowedCompanyKeys,
    companyName: userData.companyName || companyLabel(primaryCompanyKey)
  };

  startMessageListener();
});
