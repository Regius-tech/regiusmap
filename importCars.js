import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";
import fs from "fs";

// Firebase config (bruk samme som tidligere)
const firebaseConfig = {
  apiKey: "AIzaSyCKqwpql2Yl0kbpUIPrQUYyVd7m1OeH-D8",
  authDomain: "triflex-a08c7.firebaseapp.com",
  projectId: "triflex-a08c7",
  storageBucket: "triflex-a08c7.firebasestorage.app",
  messagingSenderId: "835381689765",
  appId: "1:835381689765:web:e0be4b22e5f35ca1e0bc4c",
  databaseURL: "https://triflex-a08c7-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Funksjon for å importere en JSON-fil
async function importFile(filePath, nodeName) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  await set(ref(db, nodeName), data);
  console.log(`${filePath} importert til ${nodeName}`);
}

// Eksempel: importer alle biler
(async () => {
  await importFile("./data/tsoslo.json", "cars/tsoslo");
  await importFile("./data/tsoslobud.json", "cars/tsoslobud");
  await importFile("./data/mtf.json", "cars/mtf");
  await importFile("./data/blakurer.json", "cars/blakurer");
})();
