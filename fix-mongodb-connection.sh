#!/bin/bash

# Quick fix script for MongoDB connection issue on EC2

cd ~/resume-ai-backend || exit 1

echo "Updating MONGODB_URI in .env file..."

# Update or add MONGODB_URI
if grep -q "MONGODB_URI=" .env 2>/dev/null; then
    sed -i 's|MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/resume-ai|g' .env
    echo "✅ Updated MONGODB_URI in .env"
else
    echo "MONGODB_URI=mongodb://mongodb:27017/resume-ai" >> .env
    echo "✅ Added MONGODB_URI to .env"
fi

# Verify
echo ""
echo "Current MONGODB_URI:"
grep MONGODB_URI .env

echo ""
echo "Restarting backend container..."

# Try docker-compose first
if [ -f docker-compose.prod.yml ]; then
    docker-compose -f docker-compose.prod.yml restart backend
    echo "✅ Restarted using docker-compose"
else
    # Manual restart
    docker stop resume-ai-backend 2>/dev/null
    docker rm resume-ai-backend 2>/dev/null
    
    # Create network if doesn't exist
    docker network create resume-ai-network 2>/dev/null || true
    
    docker run -d \
      --name resume-ai-backend \
      --restart unless-stopped \
      -p 3000:3000 \
      --env-file .env \
      --network resume-ai-network \
      -e MONGODB_URI=mongodb://mongodb:27017/resume-ai \
      kunal2803/resume-ai-backend:latest
    echo "✅ Restarted backend container"
fi

echo ""
echo "Waiting 5 seconds, then checking logs..."
sleep 5
docker logs --tail 20 resume-ai-backend

echo ""
echo "Done! Check the logs above for '✅ MongoDB connected successfully'"

