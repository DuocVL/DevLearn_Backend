const router = require('express').Router();
const { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerLikeComment, handlerAddReply, handlerUpdateReply, handlerDeleteReply, handlerLikeReply} = require('../controllers/commentsController');

router.post('/', handlerAddComment);
router.patch('/:commentId', handlerUpdateComment);
router.delete('/:commentId', handlerDeleteComment);
router.post('/like/:type', handlerLikeComment);

router.post('/reply', handlerAddReply);
router.patch('/reply/:')

module.exports = router;