import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";
import fs from "fs";

// === Firebase konfigurasjon ===
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

// === Konfigurasjon for bilfiler ===
const carFiles = [
  { file: "./data/tsoslo.json", company: "tsoslo" },
  { file: "./data/tsoslobud.json", company: "tsoslobud" },
  { file: "./data/mtf.json", company: "mtf" },
  { file: "./data/blakurer.json", company: "blakurer" },
];

// === Hjelpefunksjon for å konvertere isParticipant til boolean ===
function parseIsParticipant(value) {
  return value === true || value === "TRUE";
}

// === Funksjon for å importere en JSON-fil ===
async function importFile(filePath, companyNode) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  for (const car of data) {
    const carId = car.id || car.number; // Bruk id hvis tilgjengelig, ellers bilnummer
    const carData = {
      ...car,
      isParticipant: parseIsParticipant(car.isParticipant),
    };

    await set(ref(db, `cars/${companyNode}/${carId}`), carData);
  }

  console.log(`${filePath} importert til cars/${companyNode}`);
}

// === Main: import alle filer ===
(async () => {
  for (const file of carFiles) {
    try {
      await importFile(file.file, file.company);
    } catch (err) {
      console.error(`Feil under import av ${file.file}:`, err.message);
    }
  }

  console.log("Alle bilfiler importert ferdig!");
})();
