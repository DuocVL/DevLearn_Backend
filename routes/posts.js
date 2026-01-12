const express = require('express');
const router = express.Router();
const { handlerAddPost, handlerUpdatePost, handlerDeletePost, handlerGetPost, handleGetListPost } = require('../controllers/postsController');

// Matches GET /posts
router.get('/', handleGetListPost);

// Matches POST /posts
router.post('/', handlerAddPost);

// IMPORTANT: Specific routes like /:postId must come after general ones like / 
// But since GET / and GET /:postId are different methods, order doesn't matter as much here.

// Matches GET /posts/some-post-id
router.get('/:postId', handlerGetPost);

// Matches PATCH /posts/some-post-id
router.patch('/:postId', handlerUpdatePost); // Changed from router.patch('/', ...)

// Matches DELETE /posts/some-post-id
router.delete('/:postId', handlerDeletePost); // Changed from router.delete('/', ...)


module.exports = router;