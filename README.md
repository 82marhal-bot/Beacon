# 🐧 Meet PengWin HQ

Viral Panic has grown beyond its original dashboard into a small interactive penguin office.

## Meet the team

- **Sture** – Chief Suspicion Officer. Trusts coffee more than green status indicators.
- **Gunnar** – Enthusiastic idea generator. Should not be left alone with large red buttons.
- **Majvor** – The experienced problem-solver. Always asks whether you've checked the logs.
- **Bosse** – Chief Napping Officer. Occasionally approves deployments in his sleep.

The separate PengWin HQ page (/) features clickable characters with randomly selected dialogue, individual speech bubbles, and automatic message timers.
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

## Kubernetes architecture

Viral Panic runs as a containerized ASP.NET Core application in Kubernetes. The Helm chart defines a Deployment with three replicas, a Service, a ConfigMap, and an Ingress.

Kubernetes consists of a **control plane** and **worker nodes**. The control plane manages the desired state of the cluster. The **API server** receives requests from tools such as `kubectl` and Helm, while the **scheduler** decides which node should run each Pod. On the nodes, the **kubelet** ensures that the assigned Pods are running.

### From instruction to a running Pod

When I run `kubectl apply -f k8s/deployment.yaml`, the kubectl command-line tool sends the Deployment definition in the YAML file to the Kubernetes API server. The API server validates and stores the desired state.

Kubernetes controllers ensure that the number of Pods specified in the Deployment is created. The scheduler selects a node for each new Pod. On the selected node, the kubelet makes sure the Pod’s containers are started through the container runtime.

Kubernetes then continues working to maintain the desired state. If a Pod disappears, a replacement is created to restore the desired number of replicas. If a container crashes while its Pod still exists, the kubelet normally restarts the container within the same Pod.

### Architecture diagram

```text
Developer
    |
    | kubectl apply / helm upgrade --install
    v
Kubernetes Control Plane
+--------------------------------+
| API Server                     |
| Scheduler                      |
| Controllers                    |
+--------------------------------+
    |
    | Schedules and manages Pods
    v
Local node: k3d-clo25-server-0
(kubelet + 3 Beacon Pods)
+--------------------------------+
| Beacon Pod 1                   |
| Beacon Pod 2                   |
| Beacon Pod 3                   |
+--------------------------------+
    ^
    |
Service (port 80 -> 8080)
    ^
    |
Ingress Controller (Traefik)
    ^
    |
Browser / HTTP request
```

In my local k3d cluster, a single node runs both the control plane and the three Beacon Pods. The diagram separates their roles for clarity. Three replicas help keep the application available if an individual Pod fails, but they do not protect against failure of the single node.

### Networking and configuration

The **Service** provides a stable network endpoint for the Beacon Pods and distributes traffic among replicas that are ready to receive requests. It accepts traffic on port 80 and forwards it to the application on port 8080.

The **Ingress** defines hostname and path rules for incoming HTTP requests. A Service provides access to the Pods, while the Ingress adds HTTP routing from outside the cluster. This keeps the routing rules independent of individual Pod addresses.

The **Traefik Ingress controller** reads the Ingress rules and routes incoming requests to the Beacon Service, which forwards them to a ready Pod.

Application configuration is stored in the **ConfigMap** `beacon-config`. It provides `BEACON_ENVIRONMENT` and `BEACON_MESSAGE`, which the Deployment passes to the container as environment variables. The application reads these values and returns them through the `/info` endpoint.

The application’s **Secret**, `beacon-secret`, provides `BEACON_API_KEY` in the same way. The `/info` endpoint only reports whether the key is set through the `apiKeySet` field; it never returns the key itself. This demonstrates reading a Secret without exposing its value. The key is not used to authenticate requests.

For private container images, the Deployment references a separate image pull Secret, `ghcr-secret`. The current GHCR image is public and can be pulled without authentication.

The Helm chart allows the replica count, container image tag, and Ingress hostname to be configured through `values.yaml`.

## Deploy with Kubernetes and Helm

### Prerequisites

Docker, k3d, kubectl, and Helm must be installed, and Docker must be running. The steps below create a local Kubernetes cluster with Traefik as its Ingress controller.

For my local k3d setup, the cluster’s load balancer maps port 8080 on my computer to port 80 in the cluster. After deployment, the application is available at `http://localhost:8080`.

### Create a local Kubernetes cluster

The commands below use Bash syntax and can be run in Git Bash on Windows.

Run the deployment commands from the repository root, where the `charts/` directory is located.

Create a local cluster with HTTP traffic mapped from port 8080 on your computer to port 80 on the cluster’s load balancer:

```bash
k3d cluster create clo25 -p "8080:80@loadbalancer" --wait
```

Select the cluster and check that its node is ready:

```bash
kubectl config use-context k3d-clo25
kubectl get nodes
```

The default k3d setup includes the Traefik Ingress controller. Wait for it to become available:

```bash
kubectl rollout status deployment/traefik -n kube-system --timeout=180s
```

Continue with the Secret and Helm steps below.

If the cluster already exists but is stopped, start it instead of creating it again:

```bash
k3d cluster start clo25
kubectl config use-context k3d-clo25
```

### Create the secrets

1. **Optional: create an image pull secret.** The current GHCR image is public, so you can skip this step. The Deployment retains the `ghcr-secret` reference to demonstrate authentication for private images. If you want to create the secret, use a GitHub token with `read:packages`. The first command prompts you to paste the token:

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

### Verify the deployment

Wait for the Beacon Deployment to become available:

```bash
kubectl rollout status deployment/beacon --timeout=180s
kubectl get pods
```

Open `http://localhost:8080` to visit PengWin HQ. Click the office monitor to open the Beacon dashboard, or go directly to `http://localhost:8080/dashboard.html`.

Open `http://localhost:8080/info` to check the configuration. The response should contain the values from the ConfigMap and show `apiKeySet: true` when the application’s Secret contains a non-empty API key.

## Successful automated build and deploy

A successful GitHub Actions run demonstrating automated build, push to GHCR, and deployment to AKS: [Release version 6](https://github.com/82marhal-bot/Beacon/actions/runs/39419602659).

## Troubleshooting on Windows

### kubectl cannot connect through host.docker.internal

If `kubectl` times out when connecting to `https://host.docker.internal:PORT`, try connecting through localhost instead.

First, check the selected context and its API server address:

```bash
kubectl config current-context
kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
```

Use the port shown in that address. Replace `PORT` below with the actual number:

```bash
kubectl --server=https://127.0.0.1:PORT --tls-server-name=host.docker.internal --request-timeout=10s get nodes
```

This tests the connection without changing the saved configuration. The `--tls-server-name` option preserves certificate verification against `host.docker.internal`.

If the command succeeds, find the cluster entry used by the current context:

```bash
kubectl config view --minify -o jsonpath='{.contexts[0].context.cluster}'
```

Replace `CLUSTER_NAME` and `PORT` below with the values you found, then save the working connection settings:

```bash
kubectl config set-cluster CLUSTER_NAME --server=https://127.0.0.1:PORT --tls-server-name=host.docker.internal
kubectl get nodes
```

This updates only the named cluster entry in your local kubeconfig. It does not change resources inside the cluster.