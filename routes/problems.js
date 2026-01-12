const router = require('express').Router();
const { 
    handlerCreateProblems, 
    handlerUpdateProblems, 
    handlerDeleteProblems, 
    handlerGetListProblems, 
    handlerGetProblemById, // Import the new handler
    handlerSearchProblems
} = require('../controllers/problemsController');

router.post('/', handlerCreateProblems);
router.patch('/:problemId', handlerUpdateProblems);
router.delete('/:problemId', handlerDeleteProblems);
router.get('/', handlerGetListProblems);
router.get('/search', handlerSearchProblems);

// IMPORTANT: Place specific routes like '/search' before dynamic routes like '/:problemId'
router.get('/:problemId', handlerGetProblemById); // Add the new route

module.exports = router;
