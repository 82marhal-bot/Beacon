let previousInstance = null;
let instanceChanges = 0;
const observedInstances = new Set();

function updateInstance(machineName) {
    const isNewReplica = !observedInstances.has(machineName);

    observedInstances.add(machineName);

    document.getElementById("replica-count").textContent =
        observedInstances.size;

    document.getElementById("replica-list").textContent =
        [...observedInstances].join(" • ");

    if (isNewReplica && observedInstances.size > 1) {
        const replicaCard = document.getElementById("replica-card");

        replicaCard.classList.add("new-replica");

        setTimeout(() => {
            replicaCard.classList.remove("new-replica");
        }, 1200);
    }

    if (previousInstance !== null && previousInstance !== machineName) {
        instanceChanges++;
    }

    previousInstance = machineName;

    document.getElementById("instance-name").textContent = machineName;
    document.getElementById("instance-changes").textContent = instanceChanges;
}

function updatePanic(level, message) {
    document.body.className = "";
    document.body.classList.add(`state-${level.toLowerCase()}`);

    document.getElementById("panic-level").textContent = level;
    document.getElementById("panic-message").textContent = message;

    const sture = document.getElementById("sture");

    switch (level) {
        case "CALM":
            sture.src = "/images/sture-calm.png";
            break;

        case "SUSPICIOUS":
            sture.src = "/images/sture-suspicious-v2.png";
            break;

        case "ELEVATED":
            sture.src = "/images/sture-elevated-v3.png";
            break;

        case "PANIC":
            sture.src = "/images/sture-panic-v3.png";
            break;

        case "VIRAL":
            sture.src = "/images/sture-viral.png";
            break;

        default:
            sture.src = "/images/sture-calm.png";
            break;
    }
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

        const panicResponse = await fetch("/panic");

        if (!panicResponse.ok) {
            throw new Error(`Panic request failed: ${panicResponse.status}`);
        }

        const panic = await panicResponse.json();

        document.getElementById("health-status").textContent = health.status;

        updateInstance(info.machine);
        updatePanic(panic.level, panic.message);

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

loadDashboard();

setInterval(loadDashboard, 5000);

document
    .getElementById("send-request-button")
    .addEventListener("click", sendInstanceRequest);