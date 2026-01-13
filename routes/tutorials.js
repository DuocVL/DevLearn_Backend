const express = require('express');
const router = express.Router();
const tutorialsController = require('../controllers/tutorialsController');
const verifyJWT = require('../middleware/verifyJWT');
const optionalAuth = require('../middleware/optionalAuth'); // <-- IMPORT MIDDLEWARE MỚI

// === Public Routes (với thông tin người dùng nếu có) ===
// Sử dụng optionalAuth để lấy req.user nếu người dùng đã đăng nhập
router.get('/', optionalAuth, tutorialsController.handlerGetListTutorials);
router.get('/:tutorialId', optionalAuth, tutorialsController.handlerGetTutorialById);


// === Admin Routes ===
// Các route dưới đây yêu cầu xác thực và quyền admin
router.post('/', verifyJWT, tutorialsController.handlerCreateTutorial);
router.put('/:tutorialId', verifyJWT, tutorialsController.handlerUpdateTutorial);
router.delete('/:tutorialId', verifyJWT, tutorialsController.handlerDeleteTutorial);


module.exports = router;
