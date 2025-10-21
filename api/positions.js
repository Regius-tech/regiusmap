const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
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
  try {
    // 🔹 Hent alle biler fra Firebase Realtime Database
    const carsSnapshot = await db.ref("cars").once("value");
    const carsData = carsSnapshot.val() || {};

    // Lag oppslag basert på kjøretøynummer
    const vehiclesData = Object.values(carsData).reduce((acc, car) => {
      if (car.number) acc[car.number.toString()] = car;
      return acc;
    }, {});

    const allPositions = [];

    // 🔹 Hent data fra alle API-kilder
    for (const config of apiConfigurations) {
      if (!config.url || !config.apiKey) continue;

      try {
        console.log(`🔄 Henter data fra ${config.company}`);

        const response = await fetch(config.url, {
          method: "GET",
          headers: { "x-api-key": config.apiKey },
        });

        if (!response.ok) {
          console.error(`Feil fra ${config.company}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();

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
        console.error(`Feil ved behandling av ${config.company}: ${error.message}`);
      }
    }

    res.status(200).json(allPositions);
  } catch (error) {
    console.error("Feil i positions.js:", error.message);
    res.status(500).json({ error: "Kunne ikke hente kjøretøydata" });
  }
};
