# Deployment Guide with PuTTY (Windows to Ubuntu EC2)

This guide explains how to deploy the backend to Ubuntu EC2 using PuTTY from Windows.

## Prerequisites

1. Ubuntu EC2 instance with Docker installed
2. Docker Hub account
3. PuTTY installed on Windows
4. PuTTYgen (for SSH key conversion)
5. GitHub repository with Actions enabled (optional, for CI/CD)

## Step 1: Convert SSH Key for PuTTY

If you have an existing SSH key or need to create one:

### Option A: Using Existing SSH Key

1. Open **PuTTYgen** (comes with PuTTY)
2. Click **Load** and select your private key file (usually `id_rsa` or `id_rsa.ppk`)
3. If it's a `.pem` file, you may need to convert it first:
   ```powershell
   # In PowerShell on Windows
   ssh-keygen -i -f your-key.pem > id_rsa.pub
   ```
4. Click **Save private key** to save as `.ppk` format
5. Copy the public key text from the top text box

### Option B: Generate New Key Pair

1. Open **PuTTYgen**
2. Click **Generate** and move your mouse to generate randomness
3. Save the **private key** as `.ppk` file (for PuTTY)
4. Save the **public key** as `.pub` file
5. Copy the public key text

## Step 2: Add Public Key to Ubuntu EC2

### Using PuTTY to Connect

1. Open **PuTTY**
2. Enter your EC2 hostname or IP in **Host Name**
3. Set **Port** to 22
4. Go to **Connection → SSH → Auth**
5. Browse and select your `.ppk` private key file
6. Go to **Session** and save this configuration
7. Click **Open** to connect

### On Ubuntu EC2, Add Your Public Key

Once connected via PuTTY:

```bash
# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key to authorized_keys
nano ~/.ssh/authorized_keys
# Paste your public key (from PuTTYgen) here, save and exit

# Set correct permissions
chmod 600 ~/.ssh/authorized_keys
```

## Step 3: Install Docker on Ubuntu EC2

Connect to your EC2 instance via PuTTY and run:

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

# Add your user to docker group (replace 'ubuntu' with your username)
sudo usermod -aG docker $USER

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Verify installation
docker --version
```

**Important:** Log out and log back in (or run `newgrp docker`) for group changes to take effect.

## Step 4: Create Environment File on EC2

Via PuTTY session:

```bash
# Create directory for the app
mkdir -p ~/resume-ai-backend
cd ~/resume-ai-backend

# Create .env file
nano .env
```

Add your environment variables:
```
PORT=3000
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
# Add all other required environment variables
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 5: Set Up GitHub Secrets (for CI/CD)

If using GitHub Actions CI/CD:

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:

   - **DOCKER_USERNAME** - Your Docker Hub username
   - **DOCKER_PASSWORD** - Your Docker Hub password or access token
   - **EC2_HOST** - Your EC2 instance IP address or domain
   - **EC2_USERNAME** - SSH username (usually `ubuntu` for Ubuntu instances)
   - **EC2_SSH_KEY** - Your **private key in OpenSSH format** (not .ppk)
   - **EC2_PORT** - SSH port (usually 22)

### Converting .ppk to OpenSSH Format for GitHub

1. Open **PuTTYgen**
2. Load your `.ppk` file
3. Go to **Conversions** → **Export OpenSSH key**
4. Save it (e.g., as `id_rsa_openssh`)
5. Copy the entire contents of this file (including `-----BEGIN` and `-----END` lines)
6. Paste into GitHub secret **EC2_SSH_KEY**

## Step 6: Manual Deployment (Alternative to CI/CD)

If you prefer to deploy manually via PuTTY:

### Option A: Using the Deploy Script

1. Copy `deploy.sh` to your EC2 instance:

   **Using PSCP (comes with PuTTY):**
   ```powershell
   # In PowerShell on Windows
   pscp -i your-key.ppk backend/deploy.sh ubuntu@your-ec2-ip:~/resume-ai-backend/
   ```

   **Or use WinSCP** (GUI tool, easier):
   - Download WinSCP
   - Connect using your PuTTY session settings
   - Drag and drop `deploy.sh` to `~/resume-ai-backend/`

2. Via PuTTY, make script executable and update it:
   ```bash
   cd ~/resume-ai-backend
   chmod +x deploy.sh
   nano deploy.sh
   # Update IMAGE_NAME to match your Docker Hub image
   ```

3. Run deployment:
   ```bash
   ./deploy.sh
   ```

### Option B: Manual Docker Commands

Via PuTTY session:

```bash
cd ~/resume-ai-backend

# Login to Docker Hub
docker login

# Pull latest image
docker pull your-dockerhub-username/resume-ai-backend:latest

# Stop and remove old container
docker stop resume-ai-backend 2>/dev/null || true
docker rm resume-ai-backend 2>/dev/null || true

# Run new container
docker run -d \
  --name resume-ai-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  your-dockerhub-username/resume-ai-backend:latest

# Clean up
docker system prune -af
```

## Step 7: Using WinSCP for File Transfer (Recommended)

WinSCP is easier than command-line tools:

1. **Download WinSCP** from https://winscp.net/
2. **Connect** using your PuTTY session settings:
   - Host name: Your EC2 IP
   - Username: `ubuntu` (or your username)
   - Private key: Select your `.ppk` file
3. **Transfer files**:
   - Drag and drop `deploy.sh` to `~/resume-ai-backend/`
   - Edit `.env` file directly in WinSCP
   - Transfer any other files you need

## Monitoring and Troubleshooting

### Check Container Status

Via PuTTY:
```bash
# Check if container is running
docker ps

# View logs
docker logs -f resume-ai-backend

# Check container details
docker inspect resume-ai-backend
```

### Health Check

```bash
# From EC2
curl http://localhost:3000/health

# Or from Windows (if port 3000 is exposed)
# Open browser: http://your-ec2-ip:3000/health
```

### Common Issues

1. **Permission denied errors:**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker  # Or log out and back in
   ```

2. **Port already in use:**
   ```bash
   sudo lsof -i :3000
   # Kill the process or change port in docker run command
   ```

3. **Container exits immediately:**
   ```bash
   docker logs resume-ai-backend
   # Check for errors in logs
   ```

4. **Can't connect via PuTTY:**
   - Check EC2 Security Group allows SSH (port 22)
   - Verify your IP is whitelisted
   - Check that the key file is correct

## Security Best Practices

1. **Firewall Configuration:**
   ```bash
   # On Ubuntu EC2
   sudo ufw allow 22/tcp  # SSH
   sudo ufw allow 3000/tcp  # Your app (or use reverse proxy)
   sudo ufw enable
   ```

2. **Use a Reverse Proxy (Recommended):**
   - Install Nginx on EC2
   - Configure SSL with Let's Encrypt
   - Only expose ports 80/443

3. **Keep Docker Updated:**
   ```bash
   sudo apt-get update
   sudo apt-get upgrade docker-ce
   ```

4. **Regular Backups:**
   - Backup your `.env` file
   - Backup MongoDB data if running locally

## Quick Reference Commands

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# View logs
docker logs -f resume-ai-backend

# Restart container
docker restart resume-ai-backend

# Stop container
docker stop resume-ai-backend

# Remove container
docker rm resume-ai-backend

# View Docker images
docker images

# Remove unused images
docker image prune -a

# System cleanup
docker system prune -af
```

