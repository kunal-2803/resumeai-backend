#!/bin/bash

# Deployment script for EC2 server
# This script should be run on your EC2 instance

set -e

# Configuration
IMAGE_NAME="kunal2803/resume-ai-backend"
CONTAINER_NAME="resume-ai-backend"
MONGODB_CONTAINER="resume-ai-mongodb"
NETWORK_NAME="resume-ai-network"
PORT=3000
ENV_FILE=".env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment...${NC}"

# Check if docker-compose.prod.yml exists
if [ -f "docker-compose.prod.yml" ]; then
    echo -e "${YELLOW}Using docker-compose for deployment...${NC}"
    docker-compose -f docker-compose.prod.yml pull
    docker-compose -f docker-compose.prod.yml up -d
    echo -e "${GREEN}✓ Deployment successful with docker-compose!${NC}"
    docker-compose -f docker-compose.prod.yml ps
    exit 0
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: $ENV_FILE file not found!${NC}"
    exit 1
fi

# Create Docker network if it doesn't exist
echo -e "${YELLOW}Setting up Docker network...${NC}"
docker network create $NETWORK_NAME 2>/dev/null || true

# Start MongoDB if not running
echo -e "${YELLOW}Checking MongoDB container...${NC}"
if ! docker ps | grep -q $MONGODB_CONTAINER; then
    if docker ps -a | grep -q $MONGODB_CONTAINER; then
        echo -e "${YELLOW}Starting existing MongoDB container...${NC}"
        docker start $MONGODB_CONTAINER
    else
        echo -e "${YELLOW}Creating MongoDB container...${NC}"
        docker run -d \
          --name $MONGODB_CONTAINER \
          --restart unless-stopped \
          --network $NETWORK_NAME \
          -v mongodb_data:/data/db \
          -v mongodb_config:/data/configdb \
          mongo:7.0
        echo -e "${GREEN}✓ MongoDB container created${NC}"
    fi
else
    echo -e "${GREEN}✓ MongoDB container is already running${NC}"
fi

# Update .env to use Docker MongoDB (if not already set)
if ! grep -q "MONGODB_URI=mongodb://mongodb" "$ENV_FILE" 2>/dev/null; then
    echo -e "${YELLOW}Updating MONGODB_URI in .env file...${NC}"
    if grep -q "MONGODB_URI=" "$ENV_FILE"; then
        sed -i 's|MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/resume-ai|g' "$ENV_FILE"
    else
        echo "MONGODB_URI=mongodb://mongodb:27017/resume-ai" >> "$ENV_FILE"
    fi
fi

# Pull latest image
echo -e "${YELLOW}Pulling latest image...${NC}"
docker pull $IMAGE_NAME:latest

# Stop and remove existing container
echo -e "${YELLOW}Stopping existing container...${NC}"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Run new container
echo -e "${YELLOW}Starting new container...${NC}"
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p $PORT:3000 \
  --env-file $ENV_FILE \
  --network $NETWORK_NAME \
  -e MONGODB_URI=mongodb://mongodb:27017/resume-ai \
  $IMAGE_NAME:latest

# Clean up unused Docker resources
echo -e "${YELLOW}Cleaning up unused Docker resources...${NC}"
docker system prune -af --volumes

# Check if containers are running
if docker ps | grep -q $CONTAINER_NAME && docker ps | grep -q $MONGODB_CONTAINER; then
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo -e "${GREEN}Containers running:${NC}"
    docker ps | grep -E "$CONTAINER_NAME|$MONGODB_CONTAINER"
else
    echo -e "${RED}✗ Deployment failed! Containers are not running.${NC}"
    echo -e "${YELLOW}Checking logs...${NC}"
    docker logs $CONTAINER_NAME
    exit 1
fi

