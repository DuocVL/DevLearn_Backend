const router = require('express').Router();
const { createSubmission, getSubmissions, getSubmission } = require('../controllers/submissionController');


// POST /submissions - Create a new submission
router.post('/', createSubmission);

// GET /submissions - Get a list of submissions (with optional filtering)
router.get('/', getSubmissions);

// GET /submissions/:id - Get a specific submission by its ID
router.get('/:id', getSubmission);

module.exports = router;
