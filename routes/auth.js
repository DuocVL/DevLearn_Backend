const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { handlerNewUser, handlerLogout, handlerForgotPassword, handlerResetPassword } = require('../controllers/authController');
const RefreshTokens = require('../models/RefreshTokens');
const { upsertRefreshToken } = require('../controllers/refreshHelper');

function signToken(user){
    const userId = user._id
    const accessToken = jwt.sign(
        { userId , email: user.email},
        process.env.JWT_ACCESS_TOKEN_SECRET,
        { expiresIn: '15m'}
    );
    const refreshToken = jwt.sign(
        { userId , email: user.email},
        process.env.JWT_REFRESH_TOKEN_SECRET,
        { expiresIn: '7d'}
    );
    return { accessToken , refreshToken};
}

//Đăng xuất
// accept both GET (legacy) and POST (client uses POST)
router.get('/logout', handlerLogout );
router.post('/logout', handlerLogout );

//Quên mật khẩu
router.post('/forgot-password', handlerForgotPassword);
// alias routes to match mobile/frontend expectations
router.post('/forgot/send-code', handlerForgotPassword);

//Đặt lại mật khẩu
router.post('/reset-password', handlerResetPassword);
router.post('/forgot/reset', handlerResetPassword);

// Token refresh route handled by controller
const { handleRefreshToken } = require('../controllers/refreshTokenController');
router.post('/refresh', handleRefreshToken);

//Local đăng kí
router.post('/register', handlerNewUser);

//Local đăng nhập
router.post('/login', passport.authenticate('local',{session: false}), async (req, res) => {
    const { accessToken , refreshToken } = signToken(req.user);
    await upsertRefreshToken(req.user._id, req.user.email, refreshToken);
    res.json({ message: "Login successful!", user: req.user, accessToken, refreshToken});
});

//Google login
router.get('/google', passport.authenticate('google', { scope: [ 'profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/fail'}), 
    async (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        await upsertRefreshToken(req.user._id, req.user.email, refreshToken);
        res.redirect(`${process.env.CLIENT_URL}/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

// API endpoints for mobile OAuth flows (client should send idToken or code)
const { handleGoogleOAuth, handleGithubOAuth } = require('../controllers/oauthController');
router.post('/oauth/google', handleGoogleOAuth);

//Github
router.get('/github', passport.authenticate('github', { scope: [ 'user:email'] }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/auth/fail'}), 
    async (req, res) => {
        const { accessToken, refreshToken } = signToken(req.user);
        await upsertRefreshToken(req.user._id, req.user.email, refreshToken);
        res.redirect(`/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

router.post('/oauth/github', handleGithubOAuth);



router.get('/fail', (req, res) => res.status(401).json({ message: 'Authentication failed' }));

module.exports = router;