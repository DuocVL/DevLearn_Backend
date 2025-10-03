require('dotenv').config();
const express = require('express');
const passport = require('./config/passport');
const connectdb = require('./config/db');
const verifyJWT = require('./middleware/verifyJWT')
const authRoutes = require('./routes/auth');
const refreshRoutes = require('./routes/refresh');
const indexRoutes = require('./routes/index');


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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ✅`);
});