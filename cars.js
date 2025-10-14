document.addEventListener("DOMContentLoaded", async () => {
    const carList = document.getElementById("car-list");

    try {
        const response = await fetch("/api/positions"); // Hent data fra ditt API
        const cars = await response.json(); // Konverter til JSON

        if (!Array.isArray(cars)) {
            throw new Error("Ugyldig dataformat fra API");
        }

        carList.innerHTML = cars
            .map(car => `
                <div class="car-card">
                    <img src="public/${car.company}.png" alt="${car.company}" class="logo">
                    <h2>${car.name}</h2>
                    <p><strong>Modell:</strong> ${car.model}</p>
                    <p><strong>Reg.nr:</strong> ${car.licensePlate}</p>
                </div>
            `)
            .join(""); // Bygg HTML
    } catch (error) {
        console.error("Feil ved henting av bildata:", error);
        carList.innerHTML = "<p>Kunne ikke laste bilparken.</p>";
    }
});
