import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig } from "./firebaseConfig.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export function requireApprovedUser() {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const snapshot = await get(ref(db, "users/" + user.uid));
    if (!snapshot.exists()) {
      window.location.href = "index.html";
      return;
    }

    const userData = snapshot.val();

    if (userData.active === false || userData.approved !== true) {
      alert("Brukeren din er ikke godkjent eller er deaktivert.");
      await auth.signOut();
      window.location.href = "index.html";
    }
  });
}

export function requireAdmin() {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const snapshot = await get(ref(db, "users/" + user.uid));
    if (!snapshot.exists()) {
      window.location.href = "index.html";
      return;
    }

    const userData = snapshot.val();

    if (
      userData.active === false ||
      userData.approved !== true ||
      !["admin", "superadmin"].includes(userData.role)
    ) {
      alert("Du har ikke tilgang til denne siden.");
      window.location.href = "dashboard.html";
    }
  });
}

export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  const snapshot = await get(ref(db, "users/" + user.uid));
  if (!snapshot.exists()) return null;

  return {
    uid: user.uid,
    ...snapshot.val()
  };
}
