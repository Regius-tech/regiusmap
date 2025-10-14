const path = require('path');
const fs = require('fs').promises;

// Konfigurasjon for eksterne API-er og bildata
const apiConfigurations = [
    {
        url: process.env.API_URL_1,
        apiKey: process.env.API_KEY_1,
        logo: '/logo1.png',
        company: 'Transportsentralen Oslo',
        vehicleFile: 'tsoslo.json', // Filen for bilinformasjon
    },
    {
        url: process.env.API_URL_2,
        apiKey: process.env.API_KEY_2,
        logo: '/logo2.png',
        company: 'TS Oslo Budtjenester',
        vehicleFile: 'tsoslobud.json', // Filen for bilinformasjon
    },
    {
        url: process.env.API_URL_3,
        apiKey: process.env.API_KEY_3,
        logo: '/logo3.png',
        company: 'Moss Transportforum',
        vehicleFile: 'mtf.json', // Filen for bilinformasjon
    },
    {
        url: process.env.API_URL_4,
        apiKey: process.env.API_KEY_4,
        logo: '/logo4.png',
        company: 'Blå Kurér',
        vehicleFile: 'blakurer.json', // Filen for bilinformasjon
    },
];

// Funksjon for å sjekke om kjøretøyet er aktivt i dag
function isActiveToday(vehicle) {
    const vehicleTime = new Date(vehicle.time);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    vehicleTime.setHours(0, 0, 0, 0);
    return vehicleTime.getTime() === today.getTime();
}

// Funksjon for å parse `isParticipant`
function parseIsParticipant(value) {
    return value === true || value === 'TRUE';
}

// Sikrer at verdien er en streng
function ensureString(value) {
    return value ? value.toString() : '';
}

module.exports = async (req, res) => {
    try {
        const allPositions = [];

        for (const config of apiConfigurations) {
            try {
                // Les bilinformasjon fra den aktuelle JSON-filen
                const filePath = path.join(process.cwd(), 'data', config.vehicleFile);
                const fileContents = await fs.readFile(filePath, 'utf8');
                const vehiclesArray = JSON.parse(fileContents);

                // Gjør bilinformasjonen om til et oppslag (object) basert på kjøretøynummer
                const vehiclesData = vehiclesArray.reduce((acc, vehicle) => {
                    acc[vehicle.number] = vehicle;
                    return acc;
                }, {});

                console.log(`Fetching data from: ${config.url}`);
                const response = await fetch(config.url, {
                    method: 'GET',
                    headers: { 'x-api-key': config.apiKey },
                });

                if (!response.ok) {
                    console.error(`Error fetching data from ${config.url}:`, response.statusText);
                    continue;
                }

                const data = await response.json();
                console.log(`Data fetched from ${config.url}:`, data);

                // Legg til logoer, firma og kjøretøyinfo
                const vehiclesWithLogos = data.map(vehicle => {
                    const vehicleNumber = ensureString(vehicle.number);
                    const vehicleData = vehiclesData[vehicleNumber] || {};

                    return {
                        ...vehicle,
                        logo: config.logo,
                        company: config.company,
                        isActiveToday: isActiveToday(vehicle),
                        type: vehicleData.type || 'Unknown',
                        palleplasser: vehicleData.palleplasser || 'Unknown',
                        isParticipant: parseIsParticipant(vehicleData.isParticipant || false),
                    };
                });

                allPositions.push(...vehiclesWithLogos);
            } catch (error) {
                console.error(`Error processing data for ${config.company}:`, error.message);
            }
        }

        console.log('All positions processed successfully:', allPositions);
        res.json(allPositions);
    } catch (error) {
        console.error('Error fetching vehicle positions:', error.message);
        res.status(500).json({ error: 'Failed to fetch vehicle positions' });
    }
};







