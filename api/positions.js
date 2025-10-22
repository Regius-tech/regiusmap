const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const admin = require("firebase-admin");

console.log("🚀 Starter positions.js...");

// Logg alle Firebase-miljøvariabler
console.log("FIREBASE_PROJECT_ID:", !!process.env.FIREBASE_PROJECT_ID);
console.log("FIREBASE_CLIENT_EMAIL:", !!process.env.FIREBASE_CLIENT_EMAIL);
console.log("FIREBASE_PRIVATE_KEY:", !!process.env.FIREBASE_PRIVATE_KEY);
console.log("FIREBASE_DATABASE_URL:", !!process.env.FIREBASE_DATABASE_URL);

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    console.log("✅ Firebase Admin initialisert");
  } catch (err) {
    console.error("❌ Feil ved initialisering av Firebase Admin:", err);
  }
}

const db = admin.database();

const apiConfigurations = [
  {
    url: process.env.API_URL_1,
    apiKey: process.env.API_KEY_1,
    logo: "/logo1.png",
    company: "Transportsentralen Oslo",
  },
  {
    url: process.env.API_URL_2,
    apiKey: process.env.API_KEY_2,
    logo: "/logo2.png",
    company: "TS Oslo Budtjenester",
  },
  {
    url: process.env.API_URL_3,
    apiKey: process.env.API_KEY_3,
    logo: "/logo3.png",
    company: "Moss Transportforum",
  },
  {
    url: process.env.API_URL_4,
    apiKey: process.env.API_KEY_4,
    logo: "/logo4.png",
    company: "Blå Kurér",
  },
];

function isActiveToday(vehicle) {
  if (!vehicle.time) return false;
  const vehicleTime = new Date(vehicle.time);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  vehicleTime.setHours(0, 0, 0, 0);
  return vehicleTime.getTime() === today.getTime();
}

function parseIsParticipant(value) {
  return value === true || value === "TRUE" || value === "true";
}

function ensureString(value) {
  return value ? value.toString() : "";
}

module.exports = async (req, res) => {
  console.log("📡 Mottatt request til /api/positions");

  try {
    console.log("🔹 Henter biler fra Firebase Realtime Database");
    const carsSnapshot = await db.ref("cars").once("value");
    const carsData = carsSnapshot.val() || {};
    console.log(`📊 Fant ${Object.keys(carsData).length} biler i Firebase`);

    const vehiclesData = Object.values(carsData).reduce((acc, car) => {
      if (car.number) acc[car.number.toString()] = car;
      return acc;
    }, {});

    const allPositions = [];

    for (const config of apiConfigurations) {
      if (!config.url || !config.apiKey) {
        console.warn(`⚠️ Mangler url eller apiKey for ${config.company}, hopper over`);
        continue;
      }

      try {
        console.log(`🔄 Henter data fra ${config.company} (${config.url})`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8 sek timeout

        const response = await fetch(config.url, {
          method: "GET",
          headers: { "x-api-key": config.apiKey },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.error(`❌ Feil fra ${config.company}: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        console.log(`✅ Fikk ${data.length} posisjoner fra ${config.company}`);

        const vehiclesWithDetails = data.map((vehicle) => {
          const number = ensureString(vehicle.number);
          const firebaseData = vehiclesData[number] || {};

          return {
            ...vehicle,
            logo: config.logo,
            company: config.company,
            type: firebaseData.type || "Ukjent",
            palleplasser: firebaseData.palleplasser || "Ukjent",
            isParticipant: parseIsParticipant(firebaseData.isParticipant),
            isActiveToday: isActiveToday(vehicle),
          };
        });

        allPositions.push(...vehiclesWithDetails);
      } catch (error) {
        if (error.name === "AbortError") {
          console.error(`⏱️ Timeout ved henting fra ${config.company}`);
        } else {
          console.error(`❌ Feil ved behandling av ${config.company}: ${error.message}`);
        }
      }
    }

    console.log(`📦 Totalt posisjoner som sendes: ${allPositions.length}`);
    res.status(200).json(allPositions);
  } catch (error) {
    console.error("❌ Feil i positions.js:", error.message);
    res.status(500).json({ error: "Kunne ikke hente kjøretøydata" });
  }
};
