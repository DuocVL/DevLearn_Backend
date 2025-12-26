const router = require('express').Router();
const { createSubmission, getSubmission } = require('../controllers/submissionController');
const verifyJWT = require('../middleware/verifyJWT');

router.post('/', verifyJWT, createSubmission);
router.get('/:id', verifyJWT, getSubmission);

module.exports = router;