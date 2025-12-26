const express = require('express');
const router = express.Router();

const {  handleRefreshToken } = require('../controllers/refreshTokenController');

// Support GET for legacy and POST for standard API calls
router.get('/', handleRefreshToken );
router.post('/', handleRefreshToken );

module.exports = router;