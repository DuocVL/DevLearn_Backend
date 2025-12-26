const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const Users = require('../models/User');
const RefreshTokens = require('../models/RefreshTokens');
const { upsertRefreshToken } = require('./refreshHelper');
const jwt = require('jsonwebtoken');

const signTokenPair = (userId, email) => {
    const accessToken = jwt.sign({ userId, email }, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId, email }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};

// Google: accept { idToken } from mobile client
const handleGoogleOAuth = async (req, res) => {
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
            // create user
            const username = payload.name ? payload.name.replace(/\s+/g, '').toLowerCase() : `g_${payload.sub}`;
            user = await Users.create({ provider: 'google', email, username });
        }

        const { accessToken, refreshToken } = signTokenPair(user._id, email);
        await upsertRefreshToken(user._id, email, refreshToken);
        return res.json({ accessToken, refreshToken, user });
    } catch (err) {
        console.error('Google OAuth error', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// GitHub: accept { code } from client, exchange for access token
const handleGithubOAuth = async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) return res.status(400).json({ message: 'code required' });

        // exchange code
        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }, { headers: { Accept: 'application/json' } });

        const tokenData = tokenRes.data;
        if (!tokenData || tokenData.error) return res.status(400).json({ message: 'GitHub token exchange failed', details: tokenData });
        const access = tokenData.access_token;

        // fetch user emails to get primary email
        const emailsRes = await axios.get('https://api.github.com/user/emails', { headers: { Authorization: `token ${access}`, Accept: 'application/vnd.github+json' } });
        const emails = emailsRes.data || [];
        const primaryEmailObj = emails.find(e => e.primary) || emails[0];
        const email = primaryEmailObj?.email;

        if (!email) return res.status(400).json({ message: 'Email not available from GitHub' });

        let user = await Users.findOne({ email });
        if (!user) {
            // fetch basic profile
            const profileRes = await axios.get('https://api.github.com/user', { headers: { Authorization: `token ${access}` } });
            const profile = profileRes.data || {};
            const username = profile.login || `gh_${profile.id}`;
            user = await Users.create({ provider: 'github', email, username });
        }

        const { accessToken, refreshToken } = signTokenPair(user._id, email);
        await upsertRefreshToken(user._id, email, refreshToken);
        return res.json({ accessToken, refreshToken, user });
    } catch (err) {
        console.error('GitHub OAuth error', err.response?.data || err.message || err);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { handleGoogleOAuth, handleGithubOAuth };
