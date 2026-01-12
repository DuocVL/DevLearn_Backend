const express = require('express');
const router = express.Router();
const { getMyProfile } = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT'); // Import the middleware

// @route   GET /users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', verifyJWT, getMyProfile); // Apply middleware here

module.exports = router;
