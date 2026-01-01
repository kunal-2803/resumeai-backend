# Quick Fix Guide for EC2 Backend Not Accessible

## Immediate Steps to Diagnose

Run this on your EC2 server:

```bash
cd ~/resume-ai-backend
chmod +x diagnose-ec2.sh
./diagnose-ec2.sh
```

## Common Issues and Fixes

### Issue 1: Backend Container Not Running

If `docker ps` only shows MongoDB:

```bash
# Check if container exists but stopped
docker ps -a | grep resume-ai-backend

# If it exists but stopped, check logs
docker logs resume-ai-backend

# If using docker-compose
docker-compose -f docker-compose.prod.yml up -d

# If using manual deployment
./deploy.sh
```

### Issue 2: EC2 Security Group Not Allowing Port 3000

**This is likely the issue!** Check your EC2 Security Group:

1. Go to AWS Console → EC2 → Security Groups
2. Select your instance's security group
3. Check Inbound Rules
4. Add rule if missing:
   - Type: Custom TCP
   - Port: 3000
   - Source: 0.0.0.0/0 (or your IP for security)
   - Description: Backend API

### Issue 3: Backend Container Crashing

Check logs:
```bash
docker logs resume-ai-backend
```

Common causes:
- MongoDB connection failure (check MONGODB_URI in .env)
- Missing environment variables
- Application errors

Fix MongoDB connection:
```bash
# Ensure .env has correct MongoDB URI
echo "MONGODB_URI=mongodb://mongodb:27017/resume-ai" >> .env

# Restart containers
docker-compose -f docker-compose.prod.yml restart
```

### Issue 4: Using docker-compose but containers not started

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Issue 5: Port Mapping Issue

Verify port mapping:
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Should show: `0.0.0.0:3000->3000/tcp`

If not, restart container with correct port mapping:
```bash
docker stop resume-ai-backend
docker rm resume-ai-backend
docker run -d \
  --name resume-ai-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  --network resume-ai-network \
  -e MONGODB_URI=mongodb://mongodb:27017/resume-ai \
  kunal2803/resume-ai-backend:latest
```

## Quick Health Check

```bash
# From EC2 server
curl http://localhost:3000/health

# Should return: {"status":"ok","message":"Server is running"}

# If this works but browser doesn't, it's a security group issue!
```

## Test from Browser

After fixing security group:
- http://13.62.171.46:3000/health
- Should return JSON with status: ok

