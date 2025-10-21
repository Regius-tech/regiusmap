document.addEventListener("DOMContentLoaded", async () => {
    const carList = document.getElementById("car-list");

    try {
        const response = await fetch("/api/positions"); // Hent data fra API
        const cars = await response.json();

        if (!Array.isArray(cars)) {
            throw new Error("Ugyldig dataformat fra API");
        }

        carList.innerHTML = cars
            .map(car => `
                <div class="car-card">
                    <img src="/${car.company}.png" alt="${car.company}" class="logo">
                    <h2>${car.name}</h2>
                    <p><strong>Type:</strong> ${car.type}</p>
                    <p><strong>Palleplasser:</strong> ${car.palleplasser}</p>
                    <p><strong>Selskap:</strong> ${car.company}</p>
                </div>
            `)
            .join("");
    } catch (error) {
        console.error("Feil ved henting av bildata:", error);
        carList.innerHTML = "<p>Kunne ikke laste bilparken.</p>";
    }
});

