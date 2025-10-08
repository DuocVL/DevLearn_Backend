const router = require('express').Router();
const { handlerCreateProblems, handlerUpdateProblems, handlerDeleteProblems, handlerGetListProblems, handlerSearchProblems} = require('../controllers/problemsController');

router.post('/', handlerCreateProblems);
router.patch('/:problemId', handlerUpdateProblems);
router.delete('/:problemId', handlerDeleteProblems);
router.get('/', handlerGetListProblems);
router.get('/search', handlerSearchProblems);