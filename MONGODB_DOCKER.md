# Running MongoDB with Docker

This guide explains how to run MongoDB in Docker alongside your backend application.

## Quick Start

### Using Docker Compose (Recommended)

1. **For local development:**
   ```bash
   docker-compose up -d
   ```

2. **For production:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

This will start both MongoDB and the backend application.

### Manual Setup

If you prefer to run containers manually:

```bash
# Create network
docker network create resume-ai-network

# Start MongoDB
docker run -d \
  --name resume-ai-mongodb \
  --restart unless-stopped \
  --network resume-ai-network \
  -v mongodb_data:/data/db \
  -v mongodb_config:/data/configdb \
  mongo:7.0

# Start backend (update MONGODB_URI in .env)
docker run -d \
  --name resume-ai-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  --network resume-ai-network \
  -e MONGODB_URI=mongodb://mongodb:27017/resume-ai \
  kunal2803/resume-ai-backend:latest
```

## Environment Variables

Update your `.env` file to use the Docker MongoDB:

```env
MONGODB_URI=mongodb://mongodb:27017/resume-ai
```

**Note:** When using Docker Compose, the service name `mongodb` is used as the hostname. When running containers manually, ensure they're on the same Docker network.

## MongoDB Configuration

### Default Settings
- **Database:** `resume-ai`
- **Port:** `27017` (internal, not exposed in production)
- **Data Persistence:** Stored in Docker volumes

### Accessing MongoDB

**From within Docker network:**
```bash
# Connect from backend container
docker exec -it resume-ai-backend mongosh mongodb://mongodb:27017/resume-ai
```

**From host machine (if port is exposed):**
```bash
# Connect from your local machine
mongosh mongodb://localhost:27017/resume-ai
```

### MongoDB Management

**View MongoDB logs:**
```bash
docker logs -f resume-ai-mongodb
```

**Backup MongoDB data:**
```bash
# Create backup
docker exec resume-ai-mongodb mongodump --out /data/backup

# Copy backup to host
docker cp resume-ai-mongodb:/data/backup ./mongodb-backup
```

**Restore MongoDB data:**
```bash
# Copy backup to container
docker cp ./mongodb-backup resume-ai-mongodb:/data/backup

# Restore
docker exec resume-ai-mongodb mongorestore /data/backup
```

**Access MongoDB shell:**
```bash
docker exec -it resume-ai-mongodb mongosh
```

## Data Persistence

MongoDB data is stored in Docker volumes:
- `mongodb_data` - Database files
- `mongodb_config` - Configuration files

**List volumes:**
```bash
docker volume ls | grep mongodb
```

**Backup volume:**
```bash
docker run --rm -v mongodb_data:/data -v $(pwd):/backup alpine tar czf /backup/mongodb-backup.tar.gz /data
```

**Restore volume:**
```bash
docker run --rm -v mongodb_data:/data -v $(pwd):/backup alpine tar xzf /backup/mongodb-backup.tar.gz -C /
```

## Security Considerations

### Production Setup

1. **Don't expose MongoDB port externally:**
   - Remove port mapping in `docker-compose.prod.yml`
   - MongoDB is only accessible within Docker network

2. **Enable Authentication (Recommended):**
   ```yaml
   # In docker-compose.prod.yml
   mongodb:
     environment:
       - MONGO_INITDB_ROOT_USERNAME=admin
       - MONGO_INITDB_ROOT_PASSWORD=your-secure-password
   ```
   
   Then update MONGODB_URI:
   ```env
   MONGODB_URI=mongodb://admin:your-secure-password@mongodb:27017/resume-ai?authSource=admin
   ```

3. **Use secrets management:**
   - Store MongoDB credentials in environment variables
   - Use AWS Secrets Manager or similar for production

## Troubleshooting

### MongoDB won't start
```bash
# Check logs
docker logs resume-ai-mongodb

# Check if port is already in use
sudo lsof -i :27017

# Remove and recreate container
docker stop resume-ai-mongodb
docker rm resume-ai-mongodb
docker volume rm mongodb_data mongodb_config
# Then start again
```

### Connection refused
- Ensure containers are on the same network: `docker network inspect resume-ai-network`
- Check MongoDB is running: `docker ps | grep mongodb`
- Verify MONGODB_URI uses `mongodb://mongodb:27017` (not `localhost`)

### Data loss after container removal
- Data persists in Docker volumes
- Only removed if you explicitly delete volumes: `docker volume rm mongodb_data`

### Performance issues
- Increase MongoDB memory limits
- Use MongoDB replica set for production
- Consider MongoDB Atlas for managed service

## Migration from External MongoDB

If you're currently using an external MongoDB and want to migrate:

1. **Export data from external MongoDB:**
   ```bash
   mongodump --uri="mongodb://external-host:27017/resume-ai" --out=./backup
   ```

2. **Start Docker MongoDB:**
   ```bash
   docker-compose up -d mongodb
   ```

3. **Import data:**
   ```bash
   docker exec -i resume-ai-mongodb mongorestore --drop /data/backup
   # Or copy backup first:
   docker cp ./backup resume-ai-mongodb:/data/backup
   docker exec resume-ai-mongodb mongorestore /data/backup
   ```

4. **Update backend to use Docker MongoDB:**
   - Update `.env` with `MONGODB_URI=mongodb://mongodb:27017/resume-ai`
   - Restart backend container

## Monitoring

**Check MongoDB status:**
```bash
docker exec resume-ai-mongodb mongosh --eval "db.serverStatus()"
```

**Check database size:**
```bash
docker exec resume-ai-mongodb mongosh --eval "db.stats()"
```

**List databases:**
```bash
docker exec resume-ai-mongodb mongosh --eval "show dbs"
```

**List collections:**
```bash
docker exec resume-ai-mongodb mongosh resume-ai --eval "show collections"
```

