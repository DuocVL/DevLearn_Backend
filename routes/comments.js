const router = require('express').Router();
const { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerGetListComment, handlerGetReply } = require('../controllers/commentsController');

router.post('/', handlerAddComment);
router.patch('/:commentId', handlerUpdateComment);
router.delete('/:commentId', handlerDeleteComment);
router.get('/replies/:parentCommentId',handlerGetReply);
router.get('/:targetType/:targetId', handlerGetListComment);


module.exports = router;