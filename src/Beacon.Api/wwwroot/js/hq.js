
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
    bubble.textContent = lines[randomIndex];
    bubble.classList.add("visible");

    // Starta om just denna pingvins timer.
    clearTimeout(messageTimers[pengwin]);

    messageTimers[pengwin] = setTimeout(() => {
        bubble.classList.remove("visible");
    }, 3000);
}

function pressPanicButton() {
    alert("🚨 PANIC BUTTON ACTIVATED! 🚨\n\nMajvor: GUNNAR!!!");
}