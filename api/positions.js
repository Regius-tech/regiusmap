export default async function handler(req, res) {
  try {
    const FIREBASE_DB_URL = "https://triflex-a08c7-default-rtdb.europe-west1.firebasedatabase.app";

    const apiConfigs = [
      { url: process.env.API_URL_1, key: process.env.API_KEY_1, company: "Transportsentralen Oslo", logo: "/logo1.png" },
      { url: process.env.API_URL_2, key: process.env.API_KEY_2, company: "TS Oslo Budtjenester", logo: "/logo2.png" },
      { url: process.env.API_URL_3, key: process.env.API_KEY_3, company: "Moss Transportforum", logo: "/logo3.png" },
      { url: process.env.API_URL_4, key: process.env.API_KEY_4, company: "Blå Kurér", logo: "/logo4.png" },
    ];

    // --- Hent Firebase-bildata ---
    console.log("📡 Henter bildata fra Firebase...");
    const carsRes = await fetch(`${FIREBASE_DB_URL}/cars.json`);
    const carsData = await carsRes.json();
    const vehiclesMap = {};
    if (carsData) {
      Object.values(carsData).forEach(car => {
        if (car.number) vehiclesMap[car.number.toString()] = car;
      });
    }

    // --- Hent posisjoner fra alle APIer ---
    const allPositions = [];

    for (const cfg of apiConfigs) {
      if (!cfg.url || !cfg.key) {
        console.warn(`⚠️ Mangler miljøvariabler for ${cfg.company}`);
        continue;
      }

      console.log(`🌍 Henter fra ${cfg.company}: ${cfg.url}`);
      const response = await fetch(cfg.url, { headers: { "x-api-key": cfg.key } });

      if (!response.ok) {
        console.warn(`❌ Feil fra ${cfg.company}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (!Array.isArray(data)) continue;

      data.forEach(vehicle => {
        const number = vehicle.number?.toString() || "";
        const carInfo = vehiclesMap[number] || {};

        allPositions.push({
          ...vehicle,
          company: cfg.company,
          logo: cfg.logo,
          type: carInfo.type || "Ukjent",
          palleplasser: carInfo.palleplasser || "Ukjent",
          isParticipant: carInfo.isParticipant === true || carInfo.isParticipant === "true" || carInfo.isParticipant === "TRUE",
        });
      });
    }

    // --- Filtrer bort de som ikke deltar ---
    const participants = allPositions.filter(v => v.isParticipant);

    console.log(`✅ Returnerer ${participants.length} kjøretøy`);

    return res.status(200).json(participants);
  } catch (err) {
    console.error("❌ Feil i /api/positions:", err);
    return res.status(500).json({ error: "Kunne ikke hente kjøretøydata" });
  }
}
