const express = require('express');
const router = express.Router();
const { handlerAddPost, handlerUpdatePost, handlerDeletePost, handlerGetPost, handleGetListPost } = require('../controllers/postsController');

router.post('/', handlerAddPost);
router.patch('/', handlerUpdatePost);
router.delete('/', handlerDeletePost);
router.get('/:postId', handlerGetPost);
router.get('/', handleGetListPost)


module.exports = router;