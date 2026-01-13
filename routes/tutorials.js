const express = require('express');
const router = express.Router();
const tutorialsController = require('../controllers/tutorialsController');
const lessonsController = require('../controllers/lessonsController'); // <-- IMPORT LESSONS CONTROLLER
const verifyJWT = require('../middleware/verifyJWT');
const optionalAuth = require('../middleware/optionalAuth');

// === Public Routes (với thông tin người dùng nếu có) ===
router.get('/', optionalAuth, tutorialsController.handlerGetListTutorials);
router.get('/:tutorialId', optionalAuth, tutorialsController.handlerGetTutorialById);

// === Routes for Lessons within a Tutorial ===
// Lấy tất cả lessons của một tutorial cụ thể (Public)
router.get('/:tutorialId/lessons', lessonsController.handlerGetLessonsForTutorial);
// Tạo một lesson mới trong một tutorial cụ thể (Admin only)
router.post('/:tutorialId/lessons', verifyJWT, lessonsController.handlerCreateLesson);

// === Admin Routes for Tutorials ===
router.post('/', verifyJWT, tutorialsController.handlerCreateTutorial);
router.put('/:tutorialId', verifyJWT, tutorialsController.handlerUpdateTutorial);
router.delete('/:tutorialId', verifyJWT, tutorialsController.handlerDeleteTutorial);

module.exports = router;
