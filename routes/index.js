const express = require('express');
const router = express.Router();

router.use('/posts', require('./posts'));
router.use('/comments', require('./comments'));
router.use('/reactions', require('./reactions'));
// router.use('/tutorials', require('./tutorials'));
// router.use('/problems', require('./problems'));


module.exports = router;

