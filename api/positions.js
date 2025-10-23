const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const FIREBASE_DB_URL = "https://triflex-a08c7-default-rtdb.europe-west1.firebasedatabase.app";

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

async function fetchFirebase(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    if (!res.ok) throw new Error(`Feil ved henting av ${path}: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data || {};
  } catch (err) {
    console.warn(`⚠️ Kan ikke hente ${path} fra Firebase:`, err.message);
    return {};
  }
}

export default async function handler(req, res) {
  try {
    const selectedCompany = req.query.company || "all";
    const activeTodayOnly = req.query.activeToday === "true";

    console.log("📡 Henter bilinfo fra Firebase...");
    const carsData = await fetchFirebase("cars");

    const vehiclesData = {};
    Object.values(carsData).forEach(car => {
      if (car.number) vehiclesData[car.number.toString()] = car;
    });

    const allPositions = [];

    for (const config of apiConfigurations) {
      if (!config.url || !config.apiKey) continue;

      try {
        console.log(`🔄 Henter posisjoner fra ${config.company}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(config.url, {
          method: "GET",
          headers: { "x-api-key": config.apiKey },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.warn(`❌ Feil fra ${config.company}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        if (!Array.isArray(data)) continue;

        const vehiclesWithDetails = data.map(vehicle => {
          const number = ensureString(vehicle.number);
          const carInfo = vehiclesData[number] || {};
          return {
            ...vehicle,
            logo: config.logo,
            company: config.company,
            type: carInfo.type || "Ukjent",
            palleplasser: carInfo.palleplasser || "Ukjent",
            isParticipant: parseIsParticipant(carInfo.isParticipant),
            isActiveToday: isActiveToday(vehicle)
          };
        });

        allPositions.push(...vehiclesWithDetails);
      } catch (err) {
        console.error(`❌ Feil ved henting fra ${config.company}: ${err.message}`);
      }
    }

    // Filtrering
    const filteredPositions = allPositions.filter(vehicle => {
      const matchesCompany = selectedCompany === "all" || vehicle.company === selectedCompany;
      const matchesActive = !activeTodayOnly || vehicle.isActiveToday;
      return matchesCompany && matchesActive && vehicle.isParticipant;
    });

    res.status(200).json(filteredPositions);
  } catch (err) {
    console.error("❌ Feil i /api/positions:", err);
    res.status(500).json({ error: "Kunne ikke hente kjøretøydata" });
  }
}
