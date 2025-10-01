const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { handleNewUser } = require('../controllers/authController');

function signToken(user){
    const accessToken = jwt.sign(
        { id: user._id, email: user.email},
        process.env.JWT_ACCESS_TOKEN_SECRET,
        { expiresIn: '15m'}
    );
    const refreshToken = jwt.sign(
        { id: user._id, email: user.email},
        process.env.JWT_REFRESH_TOKEN_SECRET,
        { expiresIn: '7d'}
    );
    return { accessToken , refreshToken};
}

//Local đăng kí
router.post('/register', handleNewUser);

//Local đăng nhập
router.post('/login', passport.authenticate('local',{session: false}), (req, res) => {
    const { accessToken , refreshToken } = signToken(req.user);
    res.json({ message: "Login successful!", user: req.user, accessToken, refreshToken});
});

//Google login
router.get('/google', passport.authenticate('google', { scope: [ 'profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/fail'}), 
    (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        res.redirect(`${process.env.CLIENT_URL}/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

//Github
router.get('/github', passport.authenticate('github', { scope: [ 'user:email'] }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/auth/fail'}), 
    (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        res.redirect(`/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

router.get('/fail', (req, res) => res.status(401).json({ message: 'Authentication failed' }));

module.exports = router;