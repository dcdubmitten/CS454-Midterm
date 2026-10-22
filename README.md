# CS 454 Midterm - Service Deployment

## Project Overview

For this project, I built a small HTTP service using Node.js and deployed it in two different environments: Docker Compose inside a Kali Linux virtual machine and Kubernetes using Docker Desktop on Windows.

The service returns information about itself, including its name, a configurable message, the hostname of the instance handling the request, and a request counter. I used the same application source and Dockerfile for both deployments to compare how Docker Compose and Kubernetes run and manage a containerized application.

## What's Included

- `server.js` - The Node.js application that handles HTTP requests.
- `package.json` - Defines the application commands and test script.
- `Dockerfile` - Builds the application into a container image.
- `compose.yaml` - Configures the Docker Compose deployment.
- `k8s/` - Contains the Kubernetes Deployment and Service manifests.
- `test/` - Contains the smoke test script.
- `technical-report.md` - A technical writeup explaining service and answering technical questions.
- `screenshots/` - Includes all screenshots to be used as evidence of service running correctly.

## Prerequisites and Tools

The tools I used for this project were:

- Windows 11 and PowerShell
- VMware Workstation Pro
- Kali Linux
- Docker Desktop, including its local Kubernetes cluster
- Docker Engine and Docker Compose in Kali Linux
- Node.js 22 or newer for running the application and tests directly

I also used a VMware shared folder to access the project files from both Windows and Kali Linux.

## 1. Running the Application Directly

The application requires Node.js 22 or newer and has no external npm dependencies to install.

From the project directory, run:

```bash
npm test
npm start
```

In another terminal, run the smoke tests:

```bash
bash test/smoke.sh
```

The service supports the following endpoints:

- `GET /` returns the service name, message, hostname, and request count.
- `GET /health` returns HTTP 200 with `{"status":"ok"}`.
- Other requests return HTTP 404.

The port, service name, and message can be changed using environment variables. For example:

```bash
PORT=8090 SERVICE_NAME=my-service MESSAGE="Hello from my VM" npm start
```

The request counter is stored in the running application process. It increases for successful `GET /` requests, does not increase for health checks, and resets when the process restarts.

## 2. Running with Docker Compose in Kali Linux

I used a Kali Linux virtual machine to run the application through Docker Compose.

First, make sure Docker Engine and the Docker Compose plugin are installed and running in the VM. Open a terminal in the project directory, which I accessed through the VMware shared folder:

```bash
cd /mnt/hgfs/cs454-midterm
```

Build the container image and start the service:

```bash
sudo docker build -t cs454-midterm:1.0 .
sudo docker compose up -d
```

Check the container status and logs:

```bash
sudo docker compose ps
sudo docker compose logs web
```

Test the application from inside the VM:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/
```

To access the service from Windows, use the VM's IP address:

```powershell
curl.exe http://VM_IP:8080/health
```

Replace `VM_IP` with the VM's actual IP address. The VM's network configuration must allow the host to reach the published port.

I also restarted the Compose service to observe how restarting a container affects the process-local request counter.

To stop the Compose deployment:

```bash
sudo docker compose down
```

## 3. Running with Kubernetes

I used the local Kubernetes cluster provided by Docker Desktop on Windows. Because the cluster uses Docker Desktop's container environment, I built the application image using Docker Desktop before applying the Kubernetes manifests.

From PowerShell, navigate to the project directory and build the image:

```powershell
docker build -t cs454-midterm:1.0 .
```

Apply the Deployment and Service configurations:

```powershell
kubectl apply -f .\k8s\
```

Check the Deployment, Pods, and Service:

```powershell
kubectl get deployment cs454-web
kubectl get pods -o wide
kubectl get service cs454-web
```

The Deployment is configured to maintain two application replicas. The Service provides a stable way to access the application without having to select a specific Pod.

To access the Service locally, start port forwarding:

```powershell
kubectl port-forward service/cs454-web 8081:80
```

Leave that terminal running and open a second PowerShell window:

```powershell
curl.exe http://localhost:8081/health
curl.exe http://localhost:8081/
```

Kubernetes can replace a deleted Pod to maintain the desired replica count. I also examined how the Service behaves when its selector no longer matches the application Pods and verified that restoring the selector restores connectivity.

To remove the Kubernetes resources:

```powershell
kubectl delete -f .\k8s\
```

## 4. What I Learned

The main difference I observed is how each environment manages the application. Docker Compose runs the service in a container inside the Linux VM, so accessing it from Windows depends on the VM's network configuration and published port.

Kubernetes uses a Deployment to maintain the desired number of application replicas and a Service to provide access to matching Pods. Deleting a Pod does not permanently reduce the replica count because the Deployment creates a replacement. I also learned that running Pods do not automatically guarantee Service connectivity: the Service selector must match the Pods' labels.

The request counter helped demonstrate another difference between application state and deployment management. Because the counter exists only in each application process, it resets when that process restarts and is not shared between replicas.

## 5. OpenStack Analysis

The file `openstack-plan.md` contains my proposed deployment plan for running this service on OpenStack. It explains the required infrastructure, the roles of the OpenStack services, how requests would reach the application, and how I would troubleshoot common deployment and networking problems.

## Recorded Walkthrough

**Recording link:** [Recording](https://drive.google.com/file/d/1_sAIvcrmUkdOs3auY2icj9mJXyyiS9XK/view?usp=sharing)

The walkthrough demonstrates the service running in both environments and explains some troubleshooting I had to do during the development process.

**Please Note:** 

The video is available for viewing to anyone inside the UAH ecosystem. Please use your UAH google account to access.
