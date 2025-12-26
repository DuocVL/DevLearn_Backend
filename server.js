require('dotenv').config();
const http = require('http'); // Import http module
const express = require('express');
const passport = require('./config/passport');
const connectdb = require('./config/db');
const verifyJWT = require('./middleware/verifyJWT');
const authRoutes = require('./routes/auth');
const refreshRoutes = require('./routes/refresh');
const indexRoutes = require('./routes/index');
const { startWorker } = require('./services/judgeWorker');
const socketService = require('./services/socketService'); // Import socket service

const PORT = process.env.PORT || 3500;

const app = express();
app.use(express.json());
connectdb();

app.use(passport.initialize());

// Routes
app.use('/auth', authRoutes);
app.use('/refresh', refreshRoutes);
app.use(verifyJWT);
app.use('/', indexRoutes);

// Create HTTP server from the Express app
const server = http.createServer(app);

// Initialize the WebSocket server and attach it to the HTTP server
socketService.init(server);

// Start listening on the new server object
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✅`);
    // Start the judge worker
    startWorker().catch(err => console.error('Failed to start judge worker', err));
});
