let previousInstance = null;
let instanceChanges = 0;
let previousHealth = null;
let previousPanicLevel = null;
const observedInstances = new Set();

// Preload the error-state mascot while the app is available.
const weatherSture = new Image();
weatherSture.src = "/images/sture-weather.png";

const MAX_LOG_EVENTS = 30; // Behåll din befintliga rad!

function addLogEvent(message, type = "info") {
    const log = document.getElementById("event-log");

    const emptyMessage = log.querySelector(".event-empty");

    if (emptyMessage) {
        emptyMessage.remove();
    }

    const event = document.createElement("li");
    const time = new Date().toLocaleTimeString("sv-SE");

    event.textContent = `${time} · ${message}`;

    // Lägg till en CSS-klass för händelsens typ
    event.classList.add(`event-${type}`);

    log.prepend(event);

    while (log.children.length > MAX_LOG_EVENTS) {
        log.lastElementChild.remove();
    }
}

function updateInstance(machineName) {
    const isNewReplica = !observedInstances.has(machineName);

    observedInstances.add(machineName);

    document.getElementById("replica-count").textContent =
        observedInstances.size;

    document.getElementById("replica-list").textContent =
        [...observedInstances].join(" • ");

    // Logga när en ny instans upptäcks
    if (isNewReplica) {
        addLogEvent(`New instance detected: ${machineName}`, "instance");
    }

    if (isNewReplica && observedInstances.size > 1) {
        const replicaCard = document.getElementById("replica-card");

        replicaCard.classList.add("new-replica");

        setTimeout(() => {
            replicaCard.classList.remove("new-replica");
        }, 1200);
    }

    // Logga när trafiken hamnar på en annan instans
    if (previousInstance !== null && previousInstance !== machineName) {
        instanceChanges++;

        addLogEvent(
            `Instance changed: ${previousInstance} → ${machineName}`,
            "instance"
        );
    }

    previousInstance = machineName;

    document.getElementById("instance-name").textContent = machineName;
    document.getElementById("instance-changes").textContent = instanceChanges;
}

function updatePanic(level, message) {
    // Logga bara när paniknivån förändras
    if (level !== previousPanicLevel) {
        const type =
            level === "CALM" ? "success" :
            level === "SUSPICIOUS" ? "warning" :
            level === "ELEVATED" ? "warning" :
            level === "PANIC" ? "error" :
            level === "VIRAL" ? "error" :
            "info";

        if (previousPanicLevel === null) {
            addLogEvent("Initial panic level: " + level, type);
        } else {
            addLogEvent(
                "Panic level changed: " +
                previousPanicLevel + " → " + level,
                type
            );
        }

        previousPanicLevel = level;
    }

    document.body.className = "";
    document.body.classList.add(`state-${level.toLowerCase()}`);

    document.getElementById("panic-level").textContent = level;
    document.getElementById("panic-message").textContent = message;

    const sture = document.getElementById("sture");
    const footer = document.getElementById("footer-status");

    switch (level) {
        case "CALM":
            sture.src = "/images/sture-calm.png";
            footer.textContent = "Everything is suspiciously fine.";
            break;

        case "SUSPICIOUS":
            sture.src = "/images/sture-suspicious-v2.png";
            footer.textContent = "Something feels suspicious.";
            break;

        case "ELEVATED":
            sture.src = "/images/sture-elevated-v3.png";
            footer.textContent = "Sture is monitoring the situation.";
            break;

        case "PANIC":
            sture.src = "/images/sture-panic-v3.png";
            footer.textContent = "Everything is definitely NOT fine.";
            break;

        case "VIRAL":
            sture.src = "/images/sture-viral.png";
            footer.textContent = "There is no containing Sture now.";
            break;

        default:
            sture.src = "/images/sture-calm.png";
            footer.textContent = "Status unknown.";
            break;
    }
}

function updateDeployment(info, version) {
    document.getElementById("app-version").textContent =
        `v${version.version ?? "unknown"}`;

    document.getElementById("app-environment").textContent =
        info.environment ?? "unknown";

    document.getElementById("config-message").textContent =
        info.message ?? "Not configured";

    document.getElementById("api-key-status").textContent =
        info.apiKeySet ? "YES ✓" : "NO";
}

async function loadDashboard() {
    try {
        const healthResponse = await fetch("/health");

        if (!healthResponse.ok) {
            throw new Error(`Health check failed: ${healthResponse.status}`);
        }

        const health = await healthResponse.json();

        const infoResponse = await fetch("/info");

        if (!infoResponse.ok) {
            throw new Error(`Info request failed: ${infoResponse.status}`);
        }

        const info = await infoResponse.json();

        const versionResponse = await fetch("/version");

        if (!versionResponse.ok) {
            throw new Error(
                `Version request failed: ${versionResponse.status}`
            );
        }

        const version = await versionResponse.json();


        const panicResponse = await fetch("/panic");

        if (!panicResponse.ok) {
            throw new Error(`Panic request failed: ${panicResponse.status}`);
        }

        const panic = await panicResponse.json();

        document.getElementById("system-status").textContent = "System online";
        document.getElementById("health-status").textContent = health.status;
        if (health.status !== previousHealth) {
            addLogEvent(`System health: ${health.status}`, "success");
            previousHealth = health.status;
        }

        updateInstance(info.machine);
        updateDeployment(info, version);
        updatePanic(panic.level, panic.message);

        const now = new Date();

        document.getElementById("last-updated").textContent =
            now.toLocaleTimeString();
    }

    catch (error) {
        console.error("Failed to update dashboard:", error);

        // Logga bara när systemet blir otillgängligt
        if (previousHealth !== "UNAVAILABLE") {
            addLogEvent("System health: UNAVAILABLE", "error");
            previousHealth = "UNAVAILABLE";
        }

        document.getElementById("health-status").textContent = "UNAVAILABLE";
        document.getElementById("instance-name").textContent = "UNKNOWN";
        document.getElementById("panic-level").textContent = "UNKNOWN";
        document.getElementById("panic-message").textContent =
            "Command Center cannot reach the API.";

        document.body.className = "";
        document.body.classList.add("state-error");

        document.getElementById("sture").src =
            "/images/sture-weather.png";

        document.getElementById("system-status").textContent = "System offline";
        document.getElementById("footer-status").textContent =
            "Everything is suspiciously NOT fine.";

        document.getElementById("last-updated").textContent =
            new Date().toLocaleTimeString();
    }
}

async function sendInstanceRequest() {
    try {
        const response = await fetch("/info");

        if (!response.ok) {
            throw new Error(`Info request failed: ${response.status}`);
        }

        const info = await response.json();

        updateInstance(info.machine);

        document.getElementById("last-updated").textContent =
            new Date().toLocaleTimeString();
    }

    catch (error) {
        console.error("Failed to fetch instance:", error);
        document.getElementById("instance-name").textContent = "UNKNOWN";
    }
}

addLogEvent("Monitoring started", "info");

loadDashboard();

setInterval(loadDashboard, 5000);

document
    .getElementById("send-request-button")
    .addEventListener("click", sendInstanceRequest);