#!/bin/bash

# Diagnostic script for EC2 deployment issues
# Run this on your EC2 instance: ./diagnose-ec2.sh

echo "=== EC2 Deployment Diagnostics ==="
echo ""

echo "1. Checking all Docker containers (including stopped)..."
docker ps -a
echo ""

echo "2. Checking backend container logs (last 50 lines)..."
if docker ps -a | grep -q resume-ai-backend; then
    echo "--- Backend Container Logs ---"
    docker logs --tail 50 resume-ai-backend
else
    echo "❌ Backend container not found!"
fi
echo ""

echo "3. Checking MongoDB container logs (last 20 lines)..."
if docker ps -a | grep -q resume-ai-mongodb; then
    echo "--- MongoDB Container Logs ---"
    docker logs --tail 20 resume-ai-mongodb
else
    echo "❌ MongoDB container not found!"
fi
echo ""

echo "4. Checking Docker networks..."
docker network ls
echo ""

echo "5. Checking if backend container is on the network..."
if docker ps -a | grep -q resume-ai-backend; then
    docker inspect resume-ai-backend | grep -A 10 "Networks"
else
    echo "Backend container not found, skipping network check"
fi
echo ""

echo "6. Checking port mappings..."
docker ps --format "table {{.Names}}\t{{.Ports}}"
echo ""

echo "7. Checking if port 3000 is listening on host..."
sudo netstat -tlnp | grep :3000 || echo "Port 3000 not listening on host"
echo ""

echo "8. Checking .env file (MONGODB_URI only)..."
if [ -f .env ]; then
    grep MONGODB_URI .env || echo "MONGODB_URI not found in .env"
else
    echo "❌ .env file not found!"
fi
echo ""

echo "9. Testing MongoDB connectivity from host..."
if docker ps | grep -q resume-ai-mongodb; then
    docker exec resume-ai-mongodb mongosh --eval "db.adminCommand('ping')" 2>/dev/null && echo "✅ MongoDB is responding" || echo "❌ MongoDB not responding"
else
    echo "MongoDB container not running"
fi
echo ""

echo "10. Checking docker-compose file..."
if [ -f docker-compose.prod.yml ]; then
    echo "✅ docker-compose.prod.yml exists"
else
    echo "❌ docker-compose.prod.yml not found"
fi
echo ""

echo "=== Diagnostics Complete ==="

