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
  return date.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
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
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background: #023060 !important;
      color: white !important;
      border: none !important;
      cursor: pointer !important;
      font-size: 26px !important;
      box-shadow: 0 4px 15px rgba(0,0,0,0.45) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .triflex-chat-bubble:hover {
      background: #012448 !important;
      transform: translateY(-3px);
    }

    .triflex-chat-window {
      position: fixed !important;
      right: 22px !important;
      bottom: 90px !important;
      width: 360px !important;
      height: 500px !important;
      background: rgba(2,28,60,0.98) !important;
      color: white !important;
      border-radius: 14px !important;
      box-shadow: 0 6px 22px rgba(0,0,0,0.55) !important;
      z-index: 2147483647 !important;
      display: none !important;
      overflow: hidden !important;
      font-family: Poppins, sans-serif !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
    }

    .triflex-chat-window.open {
      display: flex !important;
      flex-direction: column !important;
    }

    .triflex-chat-header {
      padding: 12px;
      background: #012448;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
      user-select: none;
    }

    .triflex-chat-close {
      background: transparent;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
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

    .triflex-chat-tab.active.global { background: #0074D9; }
    .triflex-chat-tab.active.internal { background: #2ECC40; }

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

    .triflex-chat-message.internal { border-left-color: #2ECC40; }

    .triflex-chat-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 4px;
      font-size: 11px;
      color: #cfcfcf;
    }

    .triflex-chat-tag.global { color: #7FDBFF; font-weight: 800; }
    .triflex-chat-tag.internal { color: #2ECC40; font-weight: 800; }
    .triflex-chat-tag.admin { color: #FFDC00; font-weight: 800; }

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

    .triflex-chat-empty {
      color: #cfcfcf;
      text-align: center;
      margin-top: 30px;
      font-size: 13px;
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
  bubble.textContent = "💬";

  const windowEl = document.createElement("div");
  windowEl.className = "triflex-chat-window";
  windowEl.id = "triflexChatWindow";

  windowEl.innerHTML = `
    <div class="triflex-chat-header" id="triflexChatHeader">
      <strong>Triflex Chat</strong>
      <button class="triflex-chat-close" id="triflexChatClose">×</button>
    </div>

    <div class="triflex-chat-tabs">
      <button class="triflex-chat-tab global active" id="triflexGlobalTab">Konsern</button>
      <button class="triflex-chat-tab internal" id="triflexInternalTab">Intern</button>
    </div>

    <div class="triflex-chat-messages" id="triflexChatMessages">
      <div class="triflex-chat-empty">Åpner chat...</div>
    </div>

    <div class="triflex-chat-input-area">
      <textarea class="triflex-chat-input" id="triflexChatInput" placeholder="Skriv melding..."></textarea>
      <button class="triflex-chat-send" id="triflexChatSend">Send</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(windowEl);

  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    windowEl.classList.toggle("open");
    if (windowEl.classList.contains("open")) loadMessages();
  });

  document.getElementById("triflexChatClose").addEventListener("click", () => {
    windowEl.classList.remove("open");
  });

  document.getElementById("triflexGlobalTab").addEventListener("click", () => setChannel("global"));
  document.getElementById("triflexInternalTab").addEventListener("click", () => setChannel("internal"));
  document.getElementById("triflexChatSend").addEventListener("click", sendMessage);

  document.getElementById("triflexChatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function setChannel(channel) {
  currentChannel = channel;

  document.getElementById("triflexGlobalTab").classList.toggle("active", channel === "global");
  document.getElementById("triflexInternalTab").classList.toggle("active", channel === "internal");

  loadMessages();
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

function renderMessages(messages) {
  const box = document.getElementById("triflexChatMessages");
  box.innerHTML = "";

  const visible = messages.filter(canSeeMessage);

  if (!visible.length) {
    box.innerHTML = `<div class="triflex-chat-empty">Ingen meldinger her enda.</div>`;
    return;
  }

  visible.forEach(message => {
    const div = document.createElement("div");
    div.className = `triflex-chat-message ${message.channel === "internal" ? "internal" : "global"}`;

    const tag = message.channel === "global" ? "KONSERN" : "INTERN";
    const tagClass = message.channel === "global" ? "global" : "internal";
    const roleTag = ["admin", "superadmin"].includes(message.role)
      ? `<span class="triflex-chat-tag admin">${message.role === "superadmin" ? "SUPERADMIN" : "ADMIN"}</span>`
      : "";

    div.innerHTML = `
      <div class="triflex-chat-meta">
        <span class="triflex-chat-tag ${tagClass}">[${tag}]</span>
        ${roleTag}
        <span>${escapeHtml(message.email || "Ukjent")}</span>
        <span class="triflex-chat-time">${formatTime(message.createdAt)}</span>
      </div>
      <div class="triflex-chat-text">${escapeHtml(message.text)}</div>
    `;

    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

function loadMessages() {
  const box = document.getElementById("triflexChatMessages");

  if (!currentUserProfile) {
    box.innerHTML = `<div class="triflex-chat-empty">Logger inn chat...</div>`;
    return;
  }

  if (unsubscribeMessages) unsubscribeMessages();

  const messagesQuery = query(
    ref(db, "chatMessages"),
    orderByChild("createdAt"),
    limitToLast(150)
  );

  unsubscribeMessages = onValue(messagesQuery, snapshot => {
    const messages = [];

    if (snapshot.exists()) {
      const data = snapshot.val();

      for (const id in data) {
        const message = data[id];
        if (message.channel !== currentChannel) continue;
        messages.push({ id, ...message });
      }
    }

    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    renderMessages(messages);
  });
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
      createdAt: new Date().toISOString()
    });

    input.value = "";
  } finally {
    sendBtn.disabled = false;
  }
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
    allowedCompanyKeys
  };

  loadMessages();
});
