const router = require('express').Router();
const { handlerCreateSubmisson, handlerGetSubmisson, handlerGetListSubmisson } = require('../controllers/submissionController');

router.post('/', handlerCreateSubmisson);
router.get('/', handlerGetListSubmisson);
router.get('/:submissionId', handlerGetSubmisson);
