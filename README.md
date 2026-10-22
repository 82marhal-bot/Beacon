# 🐧 Meet PengWin HQ

Viral Panic has grown beyond its original dashboard into a small interactive penguin office.

## Meet the team

- **Sture** – Chief Suspicion Officer. Trusts coffee more than green status indicators.
- **Gunnar** – Enthusiastic idea generator. Should not be left alone with large red buttons.
- **Majvor** – The experienced problem-solver. Always asks whether you've checked the logs.
- **Bosse** – Chief Napping Officer. Occasionally approves deployments in his sleep.

The separate PengWin HQ page (/hq.html) features clickable characters with randomly selected dialogue, individual speech bubbles, and automatic message timers.
The original Viral Panic dashboard remains focused on API status and simulated panic levels.
PengWin HQ is an evolving frontend experiment, built to practice HTML, CSS, JavaScript, and interactive UI development alongside the cloud infrastructure project.

<p align="center">
  <img src="src/Beacon.Api/wwwroot/images/the-office.png" alt="The Viral Panic office" width="320">
</p>

## About the project

*Viral Panic* is a web application built with **C# and ASP.NET Core (.NET 10)**. It represents a small service that might suddenly experience a significant increase in traffic, for example when a campaign, news story, or shared link goes viral. *PengWin HQ* is an exciting continuation of that project.

The main focus is not complex application logic, but **cloud infrastructure, automated deployment, and kubernetes**.

Viral Panic was originally developed as part of the *Scalable Cloud Applications* course and later expanded during the *Kubernetes* course, including container orchestration, Helm deployments, and Pengwin HQ.

## Tech stack

- **C# / ASP.NET Core (.NET 10)** – backend and API
- **HTML, CSS, JavaScript** – frontend
- **Azure App Service** – web application hosting
- **Docker and Azure Container Apps** – containerized deployment
- **Azure Container Registry** – container image storage
- **Bicep** – Infrastructure as Code
- **GitHub Actions** – CI/CD pipelines
- **OIDC and Azure Key Vault** – authentication, identity, and secrets management
- **Kubernetes** – container orchestration
- **Helm** – packaging and deploying the application to Kubernetes

## Azure deployment approaches

The same application is deployed using two different Azure services.

**Azure App Service**

The web application runs on an App Service plan configured with multiple instances and platform-managed load balancing.

**Azure Container Apps**

The application runs as a container, with HTTP-based autoscaling configured between **1 and 5 replicas**.

Both deployment approaches use Bicep for infrastructure provisioning and have separate GitHub Actions workflows.

## What I learned

This project gave me hands-on experience with:

- Building and deploying an application to Azure.
- Understanding the differences between traditional web hosting and container-based deployment.
- Working with scaling, load balancing, and cloud resources.
- Automating infrastructure provisioning and application deployment.
- Troubleshooting issues involving identities, permissions, Docker, and Azure services.
- Deploying and managing applications with Kubernetes and Helm.
- Working with container registries, Kubernetes secrets, and deployment pipelines.
- Building interactive frontend features using JavaScript, reusable functions, and event handling.

An important part of the process was documenting not only what worked, but also what went wrong, how I solved it, and **what I learned along the way**.

## Documentation

The complete technical tutorial is available in Swedish:

**[Read the tutorial (Svenska)](src/docs/TUTORIAL.md)**

It covers the architecture, deployment process, security decisions, troubleshooting, and lessons learned.

## Deploy with Kubernetes and Helm

1. Create the pull secret, with a GitHub token that has only `read:packages`. The first line waits for you to
   paste the token:

   ```bash
   printf 'GitHub token: ' && read -rs GHCR_TOKEN && echo

   kubectl create secret docker-registry ghcr-secret \
     --docker-server=ghcr.io \
     --docker-username=github-username \
     --docker-password=$GHCR_TOKEN
   ```

2. Create the app's secret:

   ```bash
   kubectl create secret generic beacon-secret \
     --from-literal=BEACON_API_KEY='your-key'
   ```

3. Install the chart:

   ```bash
   helm upgrade --install beacon ./charts/beacon
   ```

   A green run of the pipeline: [Release version 5](https://github.com/82marhal-bot/Beacon/actions/runs/39404994021)