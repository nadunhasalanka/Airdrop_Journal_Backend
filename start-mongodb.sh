#!/bin/bash

# Start MongoDB container for Airdrop Journal
echo "🚀 Starting MongoDB container for Airdrop Journal..."

docker run -d \
  --name airdrop_journal_mongodb \
  --restart unless-stopped \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=airdrop123 \
  -e MONGO_INITDB_DATABASE=airdrop_journal \
  -v airdrop_journal_data:/data/db \
  mongo:7

echo "✅ MongoDB container started successfully!"
echo "📡 Connection URL: mongodb://admin:airdrop123@localhost:27017/airdrop_journal?authSource=admin"
echo ""
echo "Other useful commands:"
echo "docker stop airdrop_journal_mongodb    # Stop the container"
echo "docker start airdrop_journal_mongodb   # Start the container"
echo "docker logs airdrop_journal_mongodb    # View logs"
echo "docker exec -it airdrop_journal_mongodb mongosh -u admin -p airdrop123 --authenticationDatabase admin"
