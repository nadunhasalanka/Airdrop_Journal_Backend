# Airdrop Journal Backend

A Node.js/Express backend API for managing cryptocurrency airdrops with MongoDB database.

## 🚀 Features

- **CRUD Operations** for airdrops
- **MongoDB** database with Mongoose ODM
- **Input validation** with express-validator
- **Rate limiting** and security middleware
- **Pagination** and filtering
- **Search functionality**
- **Status-based queries**
- **Soft delete** functionality
- **Statistics** endpoints

## 📋 Prerequisites

- Node.js (v16 or higher)
- Docker (for MongoDB)
- npm or yarn

## 🛠️ Installation

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
# Edit .env with your configuration
```

4. **Start MongoDB using Docker**
```bash
cd ..
./setup-mongodb.sh
```

5. **Start the development server**
```bash
npm run dev
```

## 🔧 Environment Variables

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
- `GET /api/airdrops` - Get all airdrops (with pagination & filtering)
- `GET /api/airdrops/stats` - Get airdrop statistics
- `GET /api/airdrops/:id` - Get specific airdrop
- `POST /api/airdrops` - Create new airdrop
- `PUT /api/airdrops/:id` - Update airdrop
- `DELETE /api/airdrops/:id` - Delete airdrop (soft delete)
- `GET /api/airdrops/status/:status` - Get airdrops by status
- `PATCH /api/airdrops/:id/complete` - Mark airdrop as completed

### Query Parameters (GET /api/airdrops)
- `status` - Filter by status (upcoming, active, completed, ended)
- `tokenSymbol` - Filter by token symbol
- `priority` - Filter by priority (1-5)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - Sort direction (asc/desc, default: desc)
- `search` - Search in name, description, tokenSymbol

## 📊 Data Model

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

## 🔄 Scripts

```bash
npm start       # Start production server
npm run dev     # Start development server with nodemon
npm test        # Run tests (not implemented)
npm run lint    # Run linter (not implemented)
```

## 🐳 Docker MongoDB

Use the provided script to start MongoDB:
```bash
./setup-mongodb.sh
```

MongoDB will be available at:
- **Host**: localhost:27017
- **Database**: airdrop_journal
- **Username**: admin
- **Password**: airdrop123

## 📝 Example API Usage

### Create a new airdrop
```bash
curl -X POST http://localhost:3001/api/airdrops \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sample Airdrop",
    "description": "A sample cryptocurrency airdrop",
    "status": "upcoming",
    "tokenSymbol": "SAMPLE",
    "totalReward": "1000 SAMPLE",
    "requirements": ["Follow Twitter", "Join Discord"],
    "website": "https://example.com",
    "priority": 4
  }'
```

### Get all airdrops with filtering
```bash
curl "http://localhost:3001/api/airdrops?status=active&page=1&limit=5&search=bitcoin"
```

## 🛡️ Security Features

- Helmet for security headers
- CORS configuration
- Rate limiting
- Input validation
- MongoDB injection protection
- Error handling middleware

## 📈 Performance Features

- Database indexing
- Connection pooling
- Response compression
- Efficient pagination
- Optimized queries

## 🐛 Error Handling

The API returns consistent error responses:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## 🚦 Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error
