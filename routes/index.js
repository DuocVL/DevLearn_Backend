const express = require('express');
const router = express.Router();
const verifyJWT = require('../middleware/verifyJWT');

// Áp dụng middleware verifyJWT cho tất cả các route trong file này
router.use(verifyJWT);

// Các route yêu cầu xác thực
router.use('/posts', require('./posts'));
router.use('/comments', require('./comments'));
router.use('/reactions', require('./reactions'));
router.use('/problems', require('./problems'));
router.use('/submissions', require('./submissions'));
router.use('/users', require('./users'));
router.use('/lessons', require('./lessons')); // <-- ADD LESSONS ROUTE

module.exports = router;
