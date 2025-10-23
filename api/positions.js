const FIREBASE_DB_URL = "https://triflex-a08c7-default-rtdb.europe-west1.firebasedatabase.app";

const apiConfigurations = [
  { url: process.env.API_URL_1, logo: "/logo1.png", company: "Transportsentralen Oslo", key: "tsoslo" },
  { url: process.env.API_URL_2, logo: "/logo2.png", company: "TS Oslo Budtjenester", key: "tsoslobud" },
  { url: process.env.API_URL_3, logo: "/logo3.png", company: "Moss Transportforum", key: "mtf" },
  { url: process.env.API_URL_4, logo: "/logo4.png", company: "Blå Kurér", key: "blakurer" },
];

function ensureString(value) {
  return value ? value.toString() : "";
}

function parseIsParticipant(value) {
  return value === true || value === "TRUE" || value === "true";
}

function isActiveToday(vehicle) {
  if (!vehicle.time) return false;
  const vehicleTime = new Date(vehicle.time);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  vehicleTime.setHours(0, 0, 0, 0);
  return vehicleTime.getTime() === today.getTime();
}

async function fetchFirebase(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    if (!res.ok) throw new Error(`Feil ved henting av ${path}: ${res.status}`);
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

    console.log("📡 Henter bildata fra Firebase...");
    const allCarsData = await fetchFirebase("cars");

    // Flatten Firebase data: { [number]: carData }
    const vehiclesData = {};
    Object.keys(allCarsData).forEach(companyKey => {
      const companyCars = allCarsData[companyKey];
      if (companyCars) {
        Object.values(companyCars).forEach(car => {
          if (car && car.number) vehiclesData[car.number.toString()] = car;
        });
      }
    });

    const allPositions = [];

    for (const config of apiConfigurations) {
      if (!config.url) continue;

      try {
        console.log(`🌍 Henter posisjoner fra ${config.company}: ${config.url}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(config.url, { method: "GET", signal: controller.signal });
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

    res.status(200).json(allPositions);
  } catch (err) {
    console.error("❌ Feil i /api/positions:", err);
    res.status(500).json({ error: "Kunne ikke hente kjøretøydata" });
  }
}
