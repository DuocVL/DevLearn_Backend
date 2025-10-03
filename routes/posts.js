const express = require('express');
const router = express.Router();
const { handlerAddPost, handlerUpdatePost, handlerDeletePost, handlerGetPost } = require('../controllers/postsController');

router.post('/', handlerAddPost);
router.patch('/update', handlerUpdatePost);
router.delete('/delete', handlerDeletePost);
router.get('/:postId', handlerGetPost);

module.exports = router;