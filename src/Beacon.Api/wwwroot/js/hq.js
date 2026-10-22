
const pengwinLines = {
    sture: [
        "Vem stör min kaffeövervakning?! ☕",
        "Det där ser misstänkt ut.",
        "Har någon kontrollerat replikerna?",
        "Jag litar inte på gröna statuslampor.",
        "Gunnar. Rör. Inte. Knappen."
    ],

    gunnar: [
        "JAG HAR EN IDÉ!!! 🚀",
        "TÄNK OM VI TRYCKER PÅ KNAPPEN?!",
        "DET HÄR KAN BLI EN SYNERGI!",
        "JAG HAR GJORT EN PRESENTATION!"
    ],

    majvor: [
        "Har du läst loggarna? ☕",
        "Börja med felmeddelandet.",
        "Det där är inte en feature.",
        "Gunnar. Backa från knappen."
    ],

    bosse: [
        "Zzz... deployment approved... zzz... 💤",
        "...fem minuter till...",
        "...alla pods är friska...",
        "...rollback efter tuppluren..."
    ]
};

// Här sparar vi varje pingvins senaste replik och timer.
const lastMessageIndex = {};
const messageTimers = {};

function showPengwinMessage(pengwin) {
    const lines = pengwinLines[pengwin];
    const bubble = document.getElementById(`${pengwin}-message`);

    if (!lines || !lines.length || !bubble) {
        return;
    }

    // Välj en replik som inte är samma som förra gången.
    let randomIndex;

    do {
        randomIndex = Math.floor(Math.random() * lines.length);
    } while (
        lines.length > 1 &&
        randomIndex === lastMessageIndex[pengwin]
    );

    // Kom ihåg den senaste repliken för just denna pingvin.
    lastMessageIndex[pengwin] = randomIndex;

    // Uppdatera texten och visa bubblan.
    bubble.classList.remove("panic-shout");
    bubble.textContent = lines[randomIndex];
    bubble.classList.add("visible");

    // Starta om just denna pingvins timer.
    clearTimeout(messageTimers[pengwin]);

    messageTimers[pengwin] = setTimeout(() => {
        bubble.classList.remove("visible");
    }, 3000);
}

function showFixedMessage(pengwin, message) {
    const bubble = document.getElementById(`${pengwin}-message`);

    clearTimeout(messageTimers[pengwin]);

    bubble.textContent = message;
    bubble.classList.add("visible");

    messageTimers[pengwin] = setTimeout(() => {
        bubble.classList.remove("visible");
    }, 3000);
}

let panicTimers = [];

function pressPanicButton() {
    const bubble = document.getElementById("gunnar-message");
    const office = document.querySelector(".office");

    // Avbryt eventuella gamla reaktioner
    panicTimers.forEach(clearTimeout);
    panicTimers = [];

    // Gunnar skriker direkt!
    clearTimeout(messageTimers.gunnar);

    bubble.textContent = "JAG TRYCKTE PÅ KNAPPEN!!! 🚨🚨🚨";
    bubble.classList.add("visible", "panic-shout");

    // Starta om det röda blinkandet
    office.classList.remove("panic-active");
    void office.offsetWidth;
    office.classList.add("panic-active");

    // De andra reagerar en efter en
    panicTimers.push(setTimeout(() => {
        showFixedMessage(
            "sture",
            "VEM GAV HONOM TILLGÅNG TILL KNAPPEN?!"
        );
    }, 800));

    panicTimers.push(setTimeout(() => {
        showFixedMessage(
            "majvor",
            "Har någon läst loggarna?!"
        );
    }, 1600));

    panicTimers.push(setTimeout(() => {
        showFixedMessage(
            "bosse",
            "...fem minuter till... zzz..."
        );
    }, 2400));

    // Gunnar lugnar sig efter tre sekunder
    messageTimers.gunnar = setTimeout(() => {
        bubble.classList.remove("visible", "panic-shout");
        office.classList.remove("panic-active");
    }, 3000);
}

async function updateHqStatus() {
    const statusBox = document.querySelector(".hq-system-status");
    const statusText = document.getElementById("hq-status-text");

    try {
        const response = await fetch("/health");

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        const health = await response.json();

        // Vi kräver ett giltigt hälsostatusvärde,
        // inte bara ett lyckat HTTP-anrop.
        if (health.status?.toLowerCase() !== "healthy") {
            throw new Error(`Unhealthy status: ${health.status}`);
        }

        statusBox.classList.remove("offline");
        statusBox.classList.add("online");

        statusText.textContent = "Beacon Online";
    }
    catch (error) {
        console.error("HQ health check failed:", error);

        statusBox.classList.remove("online");
        statusBox.classList.add("offline");

        statusText.textContent = "Beacon Offline";
    }
}

updateHqStatus();

setInterval(updateHqStatus, 5000);
