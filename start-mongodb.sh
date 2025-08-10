#!/bin/bash

echo "Starting MongoDB container for Airdrop Journal..."

docker run -d \
  --name airdrop_journal_mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=airdrop123 \
  -e MONGO_INITDB_DATABASE=airdrop_journal \
  -v airdrop_journal_data:/data/db \
  mongo:7

echo "MongoDB container started successfully!"
