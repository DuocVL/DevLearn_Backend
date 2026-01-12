const router = require('express').Router();
const { createSubmission, getSubmission } = require('../controllers/submissionController');


router.post('/', createSubmission);
router.get('/:id', getSubmission);

module.exports = router;