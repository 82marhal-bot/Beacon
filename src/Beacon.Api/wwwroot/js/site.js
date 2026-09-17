async function loadDashboard() {
    try {
        const healthResponse = await fetch("/health");

        if (!healthResponse.ok) {
            throw new Error(`Health check failed: ${healthResponse.status}`);
        }

        const health = await healthResponse.json();

        const infoResponse = await fetch("/info");
        const info = await infoResponse.json();

        const panicResponse = await fetch("/panic");
        const panic = await panicResponse.json();

        document.body.className = "";
        document.body.classList.add(`state-${panic.level.toLowerCase()}`);

        document.getElementById("health-status").textContent = health.status;
        document.getElementById("instance-name").textContent = info.machine;
        document.getElementById("panic-level").textContent = panic.level;
        document.getElementById("panic-message").textContent = panic.message;

        const sture = document.getElementById("sture");

        switch (panic.level) {
            case "CALM":
                sture.src = "/images/sture-calm.png";
                break;

            case "SUSPICIOUS":
                sture.src = "/images/sture-suspicious-v2.png";
                break;

            case "ELEVATED":
                sture.src = "/images/sture-elevated.png";
                break;

            case "PANIC":
                sture.src = "/images/sture-panic.png";
                break;

            case "VIRAL":
                sture.src = "/images/sture-viral.png";
                break;

            default:
                sture.src = "/images/sture-calm.png";
                break;
        }

        const now = new Date();

        document.getElementById("last-updated").textContent =
            now.toLocaleTimeString();
    }
    catch (error) {
    console.error("Failed to update dashboard:", error);

    document.getElementById("health-status").textContent = "UNAVAILABLE";
    document.getElementById("instance-name").textContent = "UNKNOWN";
    document.getElementById("panic-level").textContent = "UNKNOWN";
    document.getElementById("panic-message").textContent =
        "Command Center cannot reach the API.";

    document.body.className = "";
    document.body.classList.add("state-error");

    document.getElementById("sture").src =
        "/images/sture-panic.png";

    document.getElementById("last-updated").textContent =
        new Date().toLocaleTimeString();
    }
}

loadDashboard();

setInterval(loadDashboard, 5000);