# EC2 Backend Not Accessible - Troubleshooting

## Current Status
✅ MongoDB container is running  
❌ Backend container NOT visible in `docker ps`

## Immediate Actions

### Step 1: Check if Backend Container Exists (Stopped or Running)

Run on EC2:
```bash
docker ps -a | grep resume-ai-backend
```

**If container exists but is stopped:**
```bash
# Check why it stopped
docker logs resume-ai-backend

# Try to start it
docker start resume-ai-backend

# Check logs again
docker logs -f resume-ai-backend
```

**If container doesn't exist:**
The container was never created or was removed. You need to start it.

### Step 2: Start Backend Container

**Option A: Using docker-compose (Recommended)**
```bash
cd ~/resume-ai-backend

# Check if docker-compose.prod.yml exists
ls -la docker-compose.prod.yml

# If exists, start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

**Option B: Using deploy.sh script**
```bash
cd ~/resume-ai-backend
chmod +x deploy.sh
./deploy.sh
```

**Option C: Manual docker run**
```bash
cd ~/resume-ai-backend

# Create network if doesn't exist
docker network create resume-ai-network 2>/dev/null || true

# Ensure MongoDB is running
docker ps | grep resume-ai-mongodb || docker start resume-ai-mongodb

# Run backend container
docker run -d \
  --name resume-ai-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  --network resume-ai-network \
  -e MONGODB_URI=mongodb://mongodb:27017/resume-ai \
  kunal2803/resume-ai-backend:latest

# Check logs
docker logs -f resume-ai-backend
```

### Step 3: Check EC2 Security Group ⚠️ MOST COMMON ISSUE

Your EC2 security group must allow inbound traffic on port 3000:

1. Go to **AWS Console → EC2 → Instances**
2. Select your instance (IP: 13.62.171.46)
3. Click **Security** tab
4. Click on the **Security Group** link
5. Click **Edit inbound rules**
6. Add rule if missing:
   - **Type:** Custom TCP
   - **Port range:** 3000
   - **Source:** 0.0.0.0/0 (or your IP for better security)
   - **Description:** Backend API
7. Click **Save rules**

### Step 4: Verify Everything is Running

```bash
# Check all containers
docker ps

# Should show both:
# - resume-ai-mongodb
# - resume-ai-backend

# Test locally on EC2
curl http://localhost:3000/health

# Should return: {"status":"ok","message":"Server is running"}
```

### Step 5: Test from Browser

After fixing security group and ensuring container is running:
- Visit: http://13.62.171.46:3000/health
- Should see: `{"status":"ok","message":"Server is running"}`

## Common Error Messages and Fixes

### "Cannot connect to MongoDB"
```bash
# Check MongoDB is running
docker ps | grep mongodb

# Check network
docker network inspect resume-ai-network

# Ensure both containers on same network
docker inspect resume-ai-backend | grep NetworkMode
docker inspect resume-ai-mongodb | grep NetworkMode

# Update .env file
echo "MONGODB_URI=mongodb://mongodb:27017/resume-ai" >> .env
```

### "Port 3000 already in use"
```bash
# Find what's using port 3000
sudo lsof -i :3000

# Or
sudo netstat -tlnp | grep :3000

# Stop the process or use different port
```

### Container exits immediately
```bash
# Check logs for errors
docker logs resume-ai-backend

# Common issues:
# - Missing .env file
# - MongoDB connection failed
# - Missing environment variables
```

## Quick Diagnostic Script

Run this on EC2 for full diagnostics:
```bash
cd ~/resume-ai-backend
chmod +x diagnose-ec2.sh
./diagnose-ec2.sh
```

