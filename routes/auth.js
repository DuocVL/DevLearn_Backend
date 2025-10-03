const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { handlerNewUser, handlerLogout } = require('../controllers/authController');
const RefreshTokens = require('../models/RefreshTokens');

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

//Đăng xuất
router.get('/logout', handlerLogout );

//Local đăng kí
router.post('/register', handlerNewUser);

//Local đăng nhập
router.post('/login', passport.authenticate('local',{session: false}), async (req, res) => {
    const { accessToken , refreshToken } = signToken(req.user);
    await RefreshTokens.create({ id: req.user._id , email: req.user.email , refreshToken });
    res.json({ message: "Login successful!", user: req.user, accessToken, refreshToken});
});

//Google login
router.get('/google', passport.authenticate('google', { scope: [ 'profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/fail'}), 
    async (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        await RefreshTokens.create({ id: req.user._id , email: req.user.email , refreshToken });
        res.redirect(`${process.env.CLIENT_URL}/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

//Github
router.get('/github', passport.authenticate('github', { scope: [ 'user:email'] }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/auth/fail'}), 
    async (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        await RefreshTokens.create({ id: req.user._id , email: req.user.email , refreshToken });
        res.redirect(`/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);



router.get('/fail', (req, res) => res.status(401).json({ message: 'Authentication failed' }));

module.exports = router;