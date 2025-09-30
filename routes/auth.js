const express = require('express');
const router = express.Router();
const passport = require('passport');
const { handleNewUser } = require('../controllers/authController');
 
//Local đăng kí
router.post('/register', handleNewUser);

//Local đăng nhập
router.post('/login', passport.authenticate('local'), (req, res) => {
    
    res.json({ message: "Login successful!", user: req.user});
});

//Google login
router.get('/google', passport.authenticate('google', { scope: [ 'profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/fail'}), 
    (req, res) => {
        // thành công => phat JWT
    }
);

//Github
router.get('/github', passport.authenticate('github', { scope: [ 'user:email'] }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/auth/fail'}), 
    (req, res) => {
        // thành công => phat JWT
    }
);

router.get('/fail', (req, res) => res.status(400).json({ message: 'Authentication failed' }));

module.exports = router;