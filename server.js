require('dotenv').config();
const http = require('http');
const express = require('express');
const passport = require('./config/passport');
const connectdb = require('./config/db');
const { connectRedis } = require('./config/redis');

// Route imports
const authRoutes = require('./routes/auth');
const refreshRoutes = require('./routes/refresh');
const tutorialsRouter = require('./routes/tutorials');
const indexRoutes = require('./routes/index');

// Service imports
const { startWorker } = require('./services/judgeWorker');
const socketService = require('./services/socketService');

const PORT = process.env.PORT || 3500;
const app = express();

// Main application startup function
async function startServer() {
  await connectdb();
  await connectRedis();

  app.use(express.json());
  app.use(passport.initialize());

  // --- Define Routes ---
  // Các route không yêu cầu xác thực JWT mặc định
  app.use('/auth', authRoutes);
  app.use('/refresh', refreshRoutes);
  app.use('/tutorials', tutorialsRouter);
  
  // Các route còn lại được gom trong indexRoutes và sẽ yêu cầu xác thực
  app.use('/', indexRoutes);

  const server = http.createServer(app);
  socketService.init(server);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✅`);
    startWorker().catch(err => console.error('Failed to start judge worker', err));
  });
}

// Start the entire application
startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
