const express = require('express');
const router = express.Router();

router.use('/posts', require('./posts'));
router.use('/comments', require('./comments'));
router.use('/reactions', require('./reactions'));
router.use('/problems', require('./problems'));
router.use('/submissions', require('./submissions'));
// router.use('/tutorials', require('./tutorials'));



module.exports = router;

