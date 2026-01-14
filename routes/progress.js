const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progressController');

// Middleware verifyJWT sẽ được áp dụng từ router cha (index.js)

// Lấy toàn bộ tiến trình của người dùng đang đăng nhập
router.get('/', progressController.handlerGetMyProgress);

// Endpoint để đánh dấu lesson đã hoàn thành
router.post('/lessons/:lessonId', progressController.handlerMarkLessonAsComplete);

module.exports = router;
