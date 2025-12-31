#!/bin/bash

# Deployment script for EC2 server
# This script should be run on your EC2 instance

set -e

# Configuration
IMAGE_NAME="kunal2803/resume-ai-backend"
CONTAINER_NAME="resume-ai-backend"
PORT=3000
ENV_FILE=".env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment...${NC}"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: $ENV_FILE file not found!${NC}"
    exit 1
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
  $IMAGE_NAME:latest

# Clean up unused Docker resources
echo -e "${YELLOW}Cleaning up unused Docker resources...${NC}"
docker system prune -af --volumes

# Check if container is running
if docker ps | grep -q $CONTAINER_NAME; then
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo -e "${GREEN}Container $CONTAINER_NAME is running${NC}"
    docker ps | grep $CONTAINER_NAME
else
    echo -e "${RED}✗ Deployment failed! Container is not running.${NC}"
    echo -e "${YELLOW}Checking logs...${NC}"
    docker logs $CONTAINER_NAME
    exit 1
fi

