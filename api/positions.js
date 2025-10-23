export default async function handler(req, res) {
  try {
    console.log("🔍 /api/positions called");

    const configs = [
      { url: process.env.API_URL_1, key: process.env.API_KEY_1, company: "Transportsentralen Oslo" },
      { url: process.env.API_URL_2, key: process.env.API_KEY_2, company: "TS Oslo Budtjenester" },
      { url: process.env.API_URL_3, key: process.env.API_KEY_3, company: "Moss Transportforum" },
      { url: process.env.API_URL_4, key: process.env.API_KEY_4, company: "Blå Kurér" },
    ];

    const results = [];

    for (const cfg of configs) {
      if (!cfg.url || !cfg.key) {
        console.log(`⚠️ Mangler miljøvariabler for ${cfg.company}`);
        continue;
      }

      console.log(`🌍 Henter fra ${cfg.company}: ${cfg.url}`);
      const r = await fetch(cfg.url, { headers: { "x-api-key": cfg.key } });
      console.log(`↩️ ${cfg.company} status: ${r.status}`);
      if (!r.ok) continue;

      const data = await r.json();
      console.log(`✅ ${cfg.company}: mottok ${Array.isArray(data) ? data.length : 0} elementer`);
      results.push(...(Array.isArray(data) ? data : []));
    }

    console.log("📦 Returnerer totalt:", results.length);
    return res.status(200).json(results);
  } catch (err) {
    console.error("❌ Crash:", err);
    return res.status(500).json({ error: err.message });
  }
}
