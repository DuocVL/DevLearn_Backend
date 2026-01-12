const jwt = require('jsonwebtoken');
const RefreshTokens = require('../models/RefreshTokens');
const Users = require('../models/User'); // Added: Import the User model
const { upsertRefreshToken } = require('../services/tokenService');

const signTokenPair = (userId, email, roles) => {
    const accessToken = jwt.sign(
        { "UserInfo": { "userId": userId, "email": email, "roles": roles } }, // Added: email to payload
        process.env.JWT_ACCESS_TOKEN_SECRET, 
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign({ userId, email }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};

const handleRefreshToken = async (req, res) => {
    try {
        const incoming = req.body?.refreshToken || req.headers['authorization']?.split(' ')[1] || req.headers['x-refresh-token'] || req.headers['x-refreshtoken'];
        if (!incoming) return res.status(400).json({ message: 'Missing refresh token' });

        const tokenUser = await RefreshTokens.findOne({ refreshToken: incoming });
        if (!tokenUser) return res.status(401).json({ message: 'Refresh token not found' });

        let decoded;
        try {
            decoded = jwt.verify(incoming, process.env.JWT_REFRESH_TOKEN_SECRET);
        } catch (err) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        const foundUser = await Users.findById(decoded.userId).exec();
        if (!foundUser) return res.status(401).json({ message: 'Unauthorized' });

        const { accessToken, refreshToken } = signTokenPair(decoded.userId, decoded.email, foundUser.roles);

        await upsertRefreshToken(decoded.userId, decoded.email, refreshToken);

        return res.status(200).json({ accessToken, refreshToken });
    } catch (err) {
        console.error('Refresh error', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { handleRefreshToken };