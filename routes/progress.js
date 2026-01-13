const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progressController');

// Endpoint để đánh dấu lesson đã hoàn thành
// Middleware verifyJWT sẽ được áp dụng từ router cha (index.js)
router.post('/lessons/:lessonId', progressController.handlerMarkLessonAsComplete);

module.exports = router;
