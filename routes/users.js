const express = require('express');
const router = express.Router();
const { getMyProfile } = require('../controllers/userController');

// @route   GET /users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', getMyProfile);

module.exports = router;
