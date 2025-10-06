const router = require('express').Router();
const { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerGetListComment, handlerGetReply } = require('../controllers/commentsController');

router.post('/', handlerAddComment);
router.patch('/:commentId', handlerUpdateComment);
router.delete('/:commentId', handlerDeleteComment);
router.get('/', handlerGetListComment);
router.get('/replies/:parentCommentId',handlerGetReply);

module.exports = router;