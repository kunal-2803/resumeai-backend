# Deployment Guide

This guide explains how to deploy the backend to EC2 using Docker and CI/CD.

## Prerequisites

1. EC2 instance with Docker installed
2. Docker Hub account (or GitHub Container Registry)
3. GitHub repository with Actions enabled
4. SSH access to your EC2 instance
5. MongoDB (can be run via Docker - see MONGODB_DOCKER.md)

## Initial EC2 Setup

### 1. Install Docker on EC2

**For Ubuntu/Debian:**
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Verify installation
docker --version

# Log out and log back in (or run 'newgrp docker') for group changes to take effect
```

**For Amazon Linux/CentOS:**
```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose (optional, for local testing)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and log back in for group changes to take effect
```

### 2. Create Environment File on EC2

```bash
# Create directory for the app
mkdir -p ~/resume-ai-backend
cd ~/resume-ai-backend

# Create .env file with your environment variables
nano .env
```

Add your environment variables:
```
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/resume-ai
JWT_SECRET=your_jwt_secret
# Add all other required environment variables
```

**Note:** If using Docker Compose, MongoDB will be available at `mongodb://mongodb:27017/resume-ai`. For external MongoDB, use your connection string.

### 3. Set Up SSH Key for GitHub Actions

**For Linux/Mac:**
On your local machine, generate an SSH key pair if you don't have one:

```bash
ssh-keygen -t rsa -b 4096 -C "github-actions"
```

Copy the public key to your EC2 instance:

```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@your-ec2-ip
```

**For Windows with PuTTY:**
1. Use PuTTYgen to generate or load your SSH key
2. Export as OpenSSH format for GitHub
3. Copy public key to EC2 via PuTTY session
4. See `DEPLOYMENT_PUTTY.md` for detailed instructions

Add the private key to GitHub Secrets (see next section).

## GitHub Secrets Configuration

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add the following secrets:

1. **DOCKER_USERNAME** - Your Docker Hub username
2. **DOCKER_PASSWORD** - Your Docker Hub password or access token
3. **EC2_HOST** - Your EC2 instance IP address or domain
4. **EC2_USERNAME** - SSH username (usually `ubuntu` for Ubuntu, `ec2-user` for Amazon Linux)
5. **EC2_SSH_KEY** - Your private SSH key (content of `~/.ssh/id_rsa`)
6. **EC2_PORT** - SSH port (optional, defaults to 22)

To get your SSH private key:
```bash
cat ~/.ssh/id_rsa
```

Copy the entire output including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`.

## Update GitHub Actions Workflow

Before deploying, update the `IMAGE_NAME` in `.github/workflows/deploy.yml`:

```yaml
env:
  REGISTRY: docker.io
  IMAGE_NAME: your-dockerhub-username/resume-ai-backend  # Update this
```

## Manual Deployment (Alternative)

If you prefer to deploy manually instead of using CI/CD:

1. Build and push the image manually:
```bash
docker build -t your-dockerhub-username/resume-ai-backend:latest .
docker push your-dockerhub-username/resume-ai-backend:latest
```

2. On EC2, use the deploy script:
```bash
# Make script executable
chmod +x deploy.sh

# Update IMAGE_NAME in deploy.sh to match your Docker Hub image
# Then run:
./deploy.sh
```

Or use docker-compose (includes MongoDB):
```bash
# Copy docker-compose.prod.yml to EC2
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

This will start both MongoDB and the backend. See `MONGODB_DOCKER.md` for MongoDB-specific instructions.

## Testing Locally

To test the Docker image locally:

```bash
# Build the image
docker build -t resume-ai-backend .

# Run with docker-compose
docker-compose up

# Or run directly
docker run -p 3000:3000 --env-file .env resume-ai-backend
```

## Monitoring

Check container logs:
```bash
docker logs -f resume-ai-backend
```

Check container status:
```bash
docker ps
docker inspect resume-ai-backend
```

Health check:
```bash
curl http://localhost:3000/health
```

## Troubleshooting

1. **Container fails to start**: Check logs with `docker logs resume-ai-backend`
2. **Environment variables not loading**: Ensure `.env` file exists and has correct permissions
3. **Port already in use**: Stop existing container or change port mapping
4. **MongoDB connection issues**: Verify `MONGODB_URI` in `.env` file
5. **SSH connection fails**: Verify SSH key is correct and EC2 security group allows SSH

## Security Considerations

1. Use environment variables for sensitive data (never commit `.env`)
2. Keep Docker images updated
3. Use non-root user in containers (already configured)
4. Regularly update EC2 instance and Docker
5. Configure EC2 security groups to allow only necessary ports
6. Consider using AWS Secrets Manager for sensitive data

