const router = require('express').Router();
const { handlerAddReaction, handlerSwapReaction, handlerDeleteReaction, handlerGetUserReaction } = require('../controllers/reactionsController');

router.post('/', handlerAddReaction);
router.patch('/:reactionId', handlerSwapReaction);
router.delete('/:reactionId', handlerDeleteReaction);
router.get('/', handlerGetUserReaction);

module.exports = router;