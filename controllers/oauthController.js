const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const Users = require('../models/User');
const { handleLogin } = require('./authController'); // Import the centralized login handler

// Google: accept { idToken } from mobile client
const handleGoogleOAuth = async (req, res, next) => {
    try {
        const { idToken } = req.body || {};
        if (!idToken) return res.status(400).json({ message: 'idToken required' });

        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload) return res.status(400).json({ message: 'Invalid idToken' });

        const email = payload.email;
        let user = await Users.findOne({ email });

        if (!user) {
            const username = payload.name ? payload.name.replace(/\s+/g, '').toLowerCase() : `g_${payload.sub}`;
            user = await Users.create({ 
                provider: 'google', 
                email, 
                username, 
                // For OAuth users, we can consider their email verified
                isEmailVerified: true 
            });
        }

        // Attach user to request and pass to the login handler
        req.user = user;
        return handleLogin(req, res);

    } catch (err) {
        console.error('Google OAuth error', err);
        return res.status(500).json({ message: 'Server error during Google OAuth' });
    }
};

// GitHub: accept { code } from client, exchange for access token
const handleGithubOAuth = async (req, res, next) => {
    try {
        const { code } = req.body || {};
        if (!code) return res.status(400).json({ message: 'code required' });

        // 1. Exchange code for access token
        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }, { headers: { Accept: 'application/json' } });

        const tokenData = tokenRes.data;
        if (!tokenData || tokenData.error || !tokenData.access_token) {
            return res.status(400).json({ message: 'GitHub token exchange failed', details: tokenData });
        }
        const githubAccessToken = tokenData.access_token;

        // 2. Fetch user's primary email
        const emailsRes = await axios.get('https://api.github.com/user/emails', { 
            headers: { Authorization: `token ${githubAccessToken}`, Accept: 'application/vnd.github+json' } 
        });
        const emails = emailsRes.data || [];
        const primaryEmailObj = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified);

        if (!primaryEmailObj || !primaryEmailObj.email) {
            return res.status(400).json({ message: 'Could not find a verified primary email from GitHub.' });
        }
        const email = primaryEmailObj.email;

        // 3. Find or create user in our database
        let user = await Users.findOne({ email });
        if (!user) {
            const profileRes = await axios.get('https://api.github.com/user', { 
                headers: { Authorization: `token ${githubAccessToken}` } 
            });
            const profile = profileRes.data || {};
            const username = profile.login || `gh_${profile.id}`;
            user = await Users.create({ 
                provider: 'github', 
                email, 
                username, 
                isEmailVerified: true 
            });
        }

        // 4. Attach user to request and pass to the centralized login handler
        req.user = user;
        return handleLogin(req, res);

    } catch (err) {
        console.error('GitHub OAuth error', err.response?.data || err.message || err);
        return res.status(500).json({ message: 'Server error during GitHub OAuth' });
    }
};

module.exports = { handleGoogleOAuth, handleGithubOAuth };
