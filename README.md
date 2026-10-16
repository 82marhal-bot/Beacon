# 🐧 Viral Panic

**A small application built to explore big traffic spikes, cloud infrastructure, and scalability in Azure.**

<p align="center">
  <img src="src/Beacon.Api/wwwroot/images/sture-calm.png" alt="Sture, the Viral Panic penguin mascot" width="320">
</p>

*Meet Sture. He's trying to stay calm while traffic spikes and cloud infrastructure does its thing.*

## About the project

Viral Panic is a web application built with **C# and ASP.NET Core (.NET 10)**. It represents a small service that might suddenly experience a significant increase in traffic, for example when a campaign, news story, or shared link goes viral.

The application is intentionally simple, with a small API and an interactive interface where Sture reacts to simulated panic levels.

The main focus is not complex application logic, but **cloud infrastructure, automated deployment, and scalability**.

This project was developed as part of the *Scalable Cloud Applications* course.

## Tech stack

- **C# / ASP.NET Core (.NET 10)** – backend and API
- **HTML, CSS, JavaScript** – frontend
- **Azure App Service** – web application hosting
- **Docker and Azure Container Apps** – containerized deployment
- **Azure Container Registry** – container image storage
- **Bicep** – Infrastructure as Code
- **GitHub Actions** – CI/CD pipelines
- **OIDC and Azure Key Vault** – authentication, identity, and secrets management

## One application, two deployment approaches

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

An important part of the process was documenting not only what worked, but also what went wrong, how I solved it, and **what I learned along the way**.

## Documentation

The complete technical tutorial is available in Swedish:

**[Read the tutorial (Svenska)](src/docs/TUTORIAL.md)**

It covers the architecture, deployment process, security decisions, troubleshooting, and lessons learned.

## Portfolio version

This repository is a standalone copy of my original course project.

GitHub Actions workflows are disabled in this portfolio repository to prevent unintended Azure deployments and costs. The workflow definitions remain in the repository as examples of the CI/CD implementation.

---

*Stay calm and scale on.*

**— Sture 🐧☁️**

## How to run it

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