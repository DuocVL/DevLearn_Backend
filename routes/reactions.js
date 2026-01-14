const router = require('express').Router();
const { handlerToggleReaction, handlerGetUsersWhoReacted } = require('../controllers/reactionsController');

// Route duy nhất để xử lý việc thêm, sửa, xóa một reaction.
// Client chỉ cần POST một object chứa { targetType, targetId, reaction }.
router.post('/', handlerToggleReaction);

// Route để lấy danh sách những người đã reaction vào một đối tượng.
// Client sẽ gọi GET /?targetType=posts&targetId=some-post-id
router.get('/', handlerGetUsersWhoReacted);


module.exports = router;
