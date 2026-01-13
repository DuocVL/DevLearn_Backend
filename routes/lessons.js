const express = require('express');
const router = express.Router();
const lessonsController = require('../controllers/lessonsController');
const verifyJWT = require('../middleware/verifyJWT');

// Middleware verifyJWT sẽ được áp dụng từ router cha (index.js)

// Cập nhật một lesson cụ thể
router.put('/:lessonId', verifyJWT, lessonsController.handlerUpdateLesson);

// Xóa một lesson cụ thể
router.delete('/:lessonId', verifyJWT, lessonsController.handlerDeleteLesson);

module.exports = router;
