require('dotenv').config();
const http = require('http');
const express = require('express');
const passport = require('./config/passport');
const connectdb = require('./config/db');
const { connectRedis } = require('./config/redis'); // Import the connect function
const verifyJWT = require('./middleware/verifyJWT');
const authRoutes = require('./routes/auth');
const refreshRoutes = require('./routes/refresh');
const indexRoutes = require('./routes/index');
const { startWorker } = require('./services/judgeWorker');
const socketService = require('./services/socketService');

const PORT = process.env.PORT || 3500;
const app = express();

// Main application startup function
async function startServer() {
  // 1. Connect to MongoDB
  await connectdb();

  // 2. Connect to Redis (and wait for it to be ready)
  await connectRedis();

  // --- All connections are now ready, configure the rest of the app ---

  app.use(express.json());
  app.use(passport.initialize());

  // Routes
  app.use('/auth', authRoutes);
  app.use('/refresh', refreshRoutes);
  app.use(verifyJWT);
  app.use('/', indexRoutes);

  const server = http.createServer(app);
  socketService.init(server);

  // 3. Start listening for HTTP requests
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✅`);

    // 4. Start the background worker
    startWorker().catch(err => console.error('Failed to start judge worker', err));
  });
}

// Start the entire application
startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
