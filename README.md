# Airdrop Journal Backend

A Node.js/Express backend API for managing cryptocurrency airdrops with MongoDB database.

## Features

- **CRUD Operations** for airdrops
- **MongoDB** database with Mongoose ODM
- **Rate limiting** and security middleware
- **Search functionality** for in app airdrops
- **Status-based queries**
- **Statistics** endpoints

## 📋 Prerequisites

- Node.js (v16 or higher)
- Docker (for MongoDB or can setup any other way you like)
- npm or yarn

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd Airdrop_Journal_Backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Make shuwer to edit the .env with your configuration
```

4. **Start MongoDB using Docker(if you prefer this way)**
```bash
cd ..
chmod +x setup-mongodb.sh
./setup-mongodb.sh
```

5. **Start the bakcend server**
```bash
npm run dev
```

## Environment Variables

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://admin:airdrop123@localhost:27017/airdrop_journal?authSource=admin
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📡 API Endpoints

### Health Check
- `GET /health` - Server health status

### Airdrops
- `GET /api/airdrops` - Get all airdrops
- `GET /api/airdrops/stats` - Get airdrop statistics
- `GET /api/airdrops/:id` - Get specific airdrop
- `POST /api/airdrops` - Create new airdrop
- `PUT /api/airdrops/:id` - Update airdrop
- `DELETE /api/airdrops/:id` - Delete airdrop (soft delete)
- `GET /api/airdrops/status/:status` - Get airdrops by status
- `PATCH /api/airdrops/:id/complete` - Mark airdrop as completed

## Data Model

### Airdrop Schema
```javascript
{
  name: String (required),
  description: String (required),
  status: String (enum: upcoming, active, completed, ended),
  startDate: Date,
  endDate: Date,
  tokenSymbol: String,
  totalReward: String,
  requirements: [String],
  website: String (URL),
  twitter: String (Twitter URL),
  discord: String (Discord URL),
  telegram: String (Telegram URL),
  isActive: Boolean,
  priority: Number (1-5),
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
```


## 🐳 Docker MongoDB

Use the provided script to start MongoDB (From above):
```bash
./setup-mongodb.sh
```

MongoDB will be available at:
- **Host**: localhost:27017
- **Database**: airdrop_journal
- **Username**: admin
- **Password**: airdrop123

## Error Handling

The API returns consistent error responses:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

#### Front-End repository:
https://github.com/nadunhasalanka/Airdrop_Journal_Frontend