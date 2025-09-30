require('dotenv').config();
const express = require('express');
const passport = require('./config/passport');
const connectdb = require('./config/db');
const authRoutes = require('./routes/auth');

const PORT = process.env.PORT || 3500;

const app = express();
app.use(express.json());
connectdb();

app.use(passport.initialize());

// Routes
app.use('/auth', authRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✅`);
});