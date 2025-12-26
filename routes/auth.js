const express = require('express');
const router = express.Router();
const passport = require('passport');

// Import handlers from controllers
const { 
    handlerNewUser, 
    handleLogin, // Our new centralized login handler
    handlerLogout, 
    handlerForgotPassword, 
    handlerResetPassword 
} = require('../controllers/authController');
const { handleRefreshToken } = require('../controllers/refreshTokenController');
const { handleGoogleOAuth, handleGithubOAuth } = require('../controllers/oauthController');

// --- Main Auth Routes ---
router.post('/register', handlerNewUser);
router.post('/login', passport.authenticate('local', { session: false }), handleLogin); // REFACTORED
router.post('/logout', handlerLogout);
router.post('/refresh', handleRefreshToken);

// --- Password Reset Flow ---
router.post('/forgot-password', handlerForgotPassword);
router.post('/reset-password', handlerResetPassword);

// --- OAuth Routes for Web Flow (Server-side redirects) ---
// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
    passport.authenticate('google', { session: false, failureRedirect: '/auth/fail' }),
    // After successful Google auth, req.user is populated. We can reuse handleLogin!
    // But the response needs to be a redirect, not JSON. So we handle it here.
    async (req, res) => {
        // Logic is simple enough to keep here, but it calls the same token services
        const { signTokenPair, upsertRefreshToken } = require('../services/tokenService');
        const { accessToken, refreshToken } = signTokenPair(req.user._id, req.user.email, req.user.roles);
        await upsertRefreshToken(req.user._id, req.user.email, refreshToken);
        // Redirect to client with tokens
        res.redirect(`${process.env.CLIENT_URL || '/'}/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

// Github
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', 
    passport.authenticate('github', { session: false, failureRedirect: '/auth/fail' }),
    async (req, res) => {
        const { signTokenPair, upsertRefreshToken } = require('../services/tokenService');
        const { accessToken, refreshToken } = signTokenPair(req.user._id, req.user.email, req.user.roles);
        await upsertRefreshToken(req.user._id, req.user.email, refreshToken);
        res.redirect(`${process.env.CLIENT_URL || '/'}/oauth-success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    }
);

// --- OAuth Routes for Mobile/Client-side Token Flow ---
router.post('/oauth/google', handleGoogleOAuth);
router.post('/oauth/github', handleGithubOAuth);

// --- Util Routes ---
router.get('/fail', (req, res) => res.status(401).json({ message: 'Authentication failed' }));

module.exports = router;
