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
      width: 370px !important;
      height: 510px !important;
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

    .triflex-chat-time {
      margin-left: auto;
      color: #9fb3c8;
    }

    .triflex-chat-text {
      white-space: pre-wrap;
      line-height: 1.4;
      color: #f2f6ff;
    }

    .triflex-chat-input-area {
      display: flex;
      gap: 8px;
      padding: 10px;
      background: #012448;
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

    .triflex-chat-empty {
      color: #cfcfcf;
      text-align: center;
      margin-top: 30px;
      font-size: 13px;
      line-height: 1.4;
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
      <textarea class="triflex-chat-input" id="triflexChatInput" placeholder="Skriv melding..."></textarea>
      <button class="triflex-chat-send" id="triflexChatSend">Send</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(chatWindow);

  restoreWindowPosition(chatWindow);

  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    openChat();
  });

  document.getElementById("triflexChatClose").addEventListener("click", () => closeChat());
  document.getElementById("triflexChatMinimize").addEventListener("click", () => closeChat());

  document.getElementById("triflexGlobalTab").addEventListener("click", () => setChannel("global"));
  document.getElementById("triflexInternalTab").addEventListener("click", () => setChannel("internal"));
  document.getElementById("triflexChatSend").addEventListener("click", sendMessage);

  document.getElementById("triflexChatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  makeDraggable(chatWindow, document.getElementById("triflexChatHeader"));
}

function openChat() {
  const chatWindow = document.getElementById("triflexChatWindow");
  chatWindow.classList.add("open");
  isOpen = true;
  unreadCount = 0;
  updateBadge();
  renderMessagesForCurrentChannel();
}

function closeChat() {
  const chatWindow = document.getElementById("triflexChatWindow");
  chatWindow.classList.remove("open");
  isOpen = false;
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

    const newUnreadMessages = messages.filter(message => {
      if (!hasInitialLoad) return false;
      if (seenMessageIds.has(message.id)) return false;
      if (message.uid === currentUserProfile.uid) return false;
      return true;
    });

    if (!isOpen && newUnreadMessages.length > 0) {
      unreadCount += newUnreadMessages.length;
      updateBadge();
    }

    messages.forEach(message => seenMessageIds.add(message.id));

    hasInitialLoad = true;
    allVisibleMessages = messages;

    renderMessagesForCurrentChannel();
  }, error => {
    console.error("Feil ved lasting av chat:", error);
    const box = document.getElementById("triflexChatMessages");
    if (box) box.innerHTML = `<div class="triflex-chat-empty">Kunne ikke laste chat.<br>${escapeHtml(error.message)}</div>`;
  });
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

    div.innerHTML = `
      <div class="triflex-chat-meta">
        <span class="triflex-chat-tag ${tagClass}">[${tag}]</span>
        ${roleTag}
        <span>${escapeHtml(message.email || "Ukjent")}</span>
        <span>${escapeHtml(companyText)}</span>
        <span class="triflex-chat-time">${formatTime(message.createdAt)}</span>
      </div>
      <div class="triflex-chat-text">${escapeHtml(message.text)}</div>
    `;

    box.appendChild(div);
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

    await set(messageRef, {
      channel: currentChannel,
      text,
      uid: currentUserProfile.uid,
      email: currentUserProfile.email,
      role: currentUserProfile.role,
      companyKey: currentUserProfile.primaryCompanyKey,
      companyKeys: currentUserProfile.allowedCompanyKeys,
      companyName: currentUserProfile.companyName,
      createdAt: new Date().toISOString()
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

  currentUserProfile = {
    uid: user.uid,
    email: userData.email || user.email || "",
    role: userData.role || "user",
    primaryCompanyKey,
    allowedCompanyKeys,
    companyName: userData.companyName || companyLabel(primaryCompanyKey)
  };

  startMessageListener();
});
