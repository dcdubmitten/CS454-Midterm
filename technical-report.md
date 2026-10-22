# Technical Report

## 1. Project Overview

For this project, I built a small HTTP service using Node.js and ran it in two environments: Docker Compose inside a Kali Linux virtual machine and Kubernetes using Docker Desktop on Windows. The goal was to run the same application in both environments and compare how each one starts, exposes, and manages the service.

The application has two main endpoints. `GET /` returns the service name, a configurable message, the hostname of the instance handling the request, and a request counter. `GET /health` returns HTTP 200 with `{"status":"ok"}`. Other requests return HTTP 404. The counter belongs to the running application process, so it resets when that process restarts and is not shared between replicas.

The project includes the Node.js source code, a Dockerfile, a Compose configuration, Kubernetes Deployment and Service manifests, a smoke-test script, and this report. The `openstack-plan.md` file contains the proposed OpenStack deployment plan.

## 2. Deployment Diagrams

### Docker Compose in a Linux VM

```text
Windows host
  curl http://192.168.122.128:8080/
             |
             | HTTP over VM network, TCP port 8080
             v
+-------------------------------------------+
| Kali Linux VM: 192.168.122.128            |
|                                           |
| Docker published port: 8080:8080          |
|             |                             |
|             v                             |
|   +-------------------------------+       |
|   | Node.js application container |       |
|   | listens on container TCP 8080 |       |
|   | GET / and GET /health         |       |
|   +-------------------------------+       |
+-------------------------------------------+
             |
             v
       HTTP response to host
```

The address above is the VM address used during my test. The host sent an HTTP request to the VM on port 8080. Docker's published port forwarded the request to port 8080 inside the container, where the Node.js application handled it. The response returned along the same connection. VMware shared folders were used to access the project files from Kali Linux; they were not part of the HTTP request path.

### Kubernetes on Docker Desktop

```text
Windows host
  curl http://localhost:8081/health
             |
             | TCP localhost:8081
             v
  kubectl port-forward service/cs454-web 8081:80
             |
             | forwards local port 8081 to Service port 80
             v
+---------------------------------------------------+
| Docker Desktop local Kubernetes cluster           |
|                                                   |
| Service: cs454-web, port 80                       |
| selector: app=cs454-web                           |
|             |                                     |
|             | selects matching Pod endpoints      |
|       +-----+------------------+                  |
|       v                        v                  |
|  +----------------+      +----------------+       |
|  | Application    |      | Application    |       |
|  | Pod 1          |      | Pod 2          |       |
|  | Node.js :8080  |      | Node.js :8080  |       |
|  +----------------+      +----------------+       |
+---------------------------------------------------+
             |
             v
       HTTP response to host
```

I used `kubectl port-forward service/cs454-web 8081:80` to access the Kubernetes Service from Windows. This confirms that the local forwarding connection and Service can reach an available endpoint when the selector is correct. It does **not** prove round-robin traffic distribution or that repeated requests are spread evenly across both Pods. Port forwarding may direct requests to a single selected Pod, so I did not use this test to claim load balancing.

## 3. Kubernetes Service Selector Failure Experiment

### Working baseline

Before changing the configuration, the application was deployed with two replicas. The Pods used the label `app: cs454-web`, and the Service selector also used `app: cs454-web`. With the selector matching the Pod labels, the Service had matching endpoints. Using the port-forward command above, I was able to request `/health` at `http://localhost:8081/health` and receive `{"status":"ok"}`.

The key baseline configuration was:

```yaml
# Pod template label in the Deployment
labels:
  app: cs454-web

# Service selector in k8s/service.yaml
selector:
  app: cs454-web
```

### Change that introduced the failure

To deliberately break the connection, I changed the Service selector in `k8s/service.yaml` from `app: cs454-web` to a label value that the Pods did not have. For example, the mismatched selector was:

```yaml
selector:
  app: wrong-app
```

I applied the changed Service manifest with:

```powershell
kubectl apply -f .\k8s\service.yaml
```

The Deployment and application Pods did not need to change for this test. The Service stopped selecting them because the Service selector no longer matched their labels.

### Client symptom and observations

The client request that had worked in the baseline no longer reached the application through the Service. The relevant client test was:

```powershell
curl.exe --max-time 5 http://localhost:8081/health
```

With the selector mismatch, the request failed or timed out rather than returning the normal health response. I kept the `kubectl port-forward service/cs454-web 8081:80` process running while testing, and used a separate terminal for the request. If port forwarding had been stopped, it would need to be started again before interpreting a connection error as a Service-selector failure.

I checked the Kubernetes resources to distinguish a broken Service route from an application that had stopped:

```powershell
kubectl get pods --show-labels
kubectl get deployment cs454-web
kubectl get service cs454-web -o yaml
kubectl get endpointslices -l kubernetes.io/service-name=cs454-web
```

The important observations for this experiment are:

1. **Pod state and labels:** the application Pods could remain `Running`/`Ready` and still carry `app=cs454-web`. This indicates that the application containers themselves had not necessarily failed.
2. **Service selector:** the Service configuration showed `app=wrong-app`, which did not match the Pods' `app=cs454-web` label.
3. **Endpoints/EndpointSlices:** with no matching Pods, the Service had no usable backend endpoints. This explains why the client could not reach the app through the Service even though the Pods were healthy.

The exact command outputs and client error should be kept with the experiment screenshots. A `Running` Pod alone is not proof of end-to-end connectivity. A client request through a Service also depends on the Service selector matching Pod labels, the Service having endpoints, and the client using a valid route to the Service.

### Correction and recovery

I restored the Service selector to match the Deployment's Pod labels:

```yaml
selector:
  app: cs454-web
```

Then I reapplied the Service configuration:

```powershell
kubectl apply -f .\k8s\service.yaml
kubectl get endpointslices -l kubernetes.io/service-name=cs454-web
curl.exe --max-time 5 http://localhost:8081/health
```

After the selector was restored, the Service could select the application Pods again, and the health request returned `{"status":"ok"}`. The correction was to fix the Service-to-Pod label match, not to rebuild the image or rewrite the application.

### What this experiment demonstrates

Kubernetes keeps the application Pods and the Service as separate resources. The Deployment can keep its Pods running and ready, but the Service only routes to Pods that match its selector. A healthy application does not, by itself, prove that a client can reach it through the Service; the Service's selector and resulting endpoints must also be correct. This is why checking Pod readiness alone is insufficient when troubleshooting an access failure.

## 4. VM/Compose and Kubernetes Comparison

Docker Compose was the simpler option for this small service. I started the container inside the Kali VM, checked its status and logs, and sent requests to the VM's published port. From Windows, access depended on the VM's network configuration and Docker's published port. Compose is sufficient when the application is small, one instance is acceptable, and a straightforward way to run and restart the container is enough.

Kubernetes required more configuration, including a Deployment and a Service. The Deployment declares the desired replica count and replaces a deleted Pod to return to that desired state. The Service gives clients a stable target for matching Pods. In my experiment, Kubernetes provided two replicas and automatic Pod replacement, and the selector-failure test showed how Service routing can fail independently of Pod health. Kubernetes was more capable for managing replicas, but it also introduced additional configuration and troubleshooting steps.

Neither environment eliminates the need to check the complete request path. With Compose, that path includes the host, VM address, published port, and container port. With Kubernetes, it also includes the Service selector and the Service's available endpoints.

## 5. OpenStack Deployment Plan

For this project, I would run my Node.js service on one Linux virtual machine using Docker Compose. Since the service is small and only handles basic HTTP requests, I think a VM with 1 CPU and 1--2 GiB of RAM would be enough for a class demo. I would use an Ubuntu LTS image and create a key pair so I could securely connect to the VM using SSH.

I would set up a private network and subnet for the VM and connect them to a router. If outside access is allowed, I would connect the router to an external network and assign the VM a floating IP. I would also set up a security group that allows traffic on port 8080 for the service and port 22 for SSH from my own trusted IP address. Allowing ping through ICMP would be optional. If some of these resources were already set up by the cloud administrator, I would use those instead of creating duplicates.

I would not need a Cinder storage volume for this project because the service does not store important data that needs to survive if the VM is replaced. A separate volume would make more sense if the application needed to keep files or other data between restarts.

### OpenStack Services

Several OpenStack services would work together to create and connect my VM. Keystone handles authentication and makes sure I have permission to use OpenStack. Glance provides the Linux image that the VM will use. Nova creates and manages the VM based on the image, selected flavor, key pair, and network settings. Neutron handles the networking, including the private network, subnet, router, security groups, and floating IP.

After the VM was running, I would connect to it using SSH, make sure Docker and Docker Compose were installed, and copy my project files over. Then I would start the application with `docker compose up -d`. Docker Compose would run the container and make its port available on the VM. It would not create the VM or handle the OpenStack networking itself.

### How Requests Reach the Application

A user outside the cloud would send an HTTP request to the VM's floating IP on port 8080. OpenStack networking would direct the traffic to the VM, as long as the router and floating IP were configured correctly and the security group allowed the connection.

Once the request reached the VM, Docker's port mapping, `8080:8080`, would send it to port 8080 inside the container. The Node.js application would then process the request and return a response. SSH would use port 22 separately. I would not rely on ping alone to determine whether the service was working, since ping can be blocked even when HTTP requests are allowed.

### Troubleshooting

If the VM was running but I could not reach the application, I would check each part of the setup separately. First, I would run `docker compose ps` and `docker compose logs web` to check whether the container was running and look for errors. I would also test `curl http://localhost:8080/health` from inside the VM.

If that request failed, I would check the container, application settings, logs, and port mapping. If it worked, I would move on to checking the VM's firewall and network settings. I would verify the floating IP, router connection, subnet, security group, and port 8080 rule. I would also check that the VM was running correctly.

I would save the command output as I went so I could see where the problem started. If the application worked from inside the VM but not from outside, I would focus on the network configuration before changing or rebuilding the application.

### Complexity and Comparison

Running OpenStack involves more setup than running an application on an existing computer or VM because multiple services must work together. For example, if a VM is created without being attached to the correct network, it may run normally but still be unreachable from other systems. Fixing this requires checking the VM's network configuration in Neutron rather than troubleshooting the application itself. This demonstrates how problems in the cloud infrastructure can affect an application even when the application is functioning correctly.

Compared with the VM and Docker Compose setup, Kubernetes provides more automatic management of the application. In my project, I used Kubernetes to run two replicas, access them through a Service, and test how it responds when a Pod is deleted. The selector test showed that Pods can be running normally while the Service still fails to reach them if its selector does not match their labels.

For a small application like mine, a single VM running Docker Compose would probably be enough. Kubernetes would be more useful if I needed multiple replicas and automatic replacement of deleted or failed Pods. OpenStack would provide the underlying VMs and networking, while Docker Compose or Kubernetes would manage how the application runs.

## 6. Conclusion

This project helped me compare running a container in a VM with running an application through Kubernetes. Compose was simpler to set up, while Kubernetes offered replica management and automatic Pod replacement. The selector experiment showed that configuration and networking matter just as much as whether the application itself is running. The OpenStack plan extends the same ideas to a cloud environment, where the VM, network, security rules, and container must all be configured correctly.

## References

1. OpenStack Nova documentation — Compute service and VM management. https://docs.openstack.org/nova/latest/index.html
2. OpenStack security groups documentation — Rules controlling inbound and outbound traffic. https://docs.openstack.org/nova/2024.2/user/security-groups.html
3. OpenStack Neutron documentation — Networks, subnets, routers, floating IPs, and security groups. https://docs.openstack.org/neutron/latest/admin/intro-os-networking.html
4. OpenStack Keystone documentation — Identity, authentication, and access to OpenStack services. https://docs.openstack.org/keystone/latest/
5. OpenStack Glance documentation — Managing and retrieving virtual machine images. https://docs.openstack.org/glance/latest/
6. OpenStack Cinder documentation — Block storage volumes for virtual machines. https://docs.openstack.org/cinder/latest/
