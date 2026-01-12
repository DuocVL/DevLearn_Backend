const jwt = require('jsonwebtoken');
const RefreshTokens = require('../models/RefreshTokens');
const Users = require('../models/User');
// CORRECT: Import both signTokenPair and upsertRefreshToken from the central service
const { signTokenPair, upsertRefreshToken } = require('../services/tokenService');

// REMOVED: Inconsistent local signTokenPair function is deleted.

const handleRefreshToken = async (req, res) => {
    try {
        const incoming = req.body?.refreshToken || req.headers['authorization']?.split(' ')[1] || req.headers['x-refresh-token'] || req.headers['x-refreshtoken'];
        if (!incoming) return res.status(400).json({ message: 'Missing refresh token' });

        const tokenInDb = await RefreshTokens.findOne({ refreshToken: incoming });
        if (!tokenInDb) return res.status(401).json({ message: 'Refresh token not found or has been invalidated' });

        let decoded;
        try {
            decoded = jwt.verify(incoming, process.env.JWT_REFRESH_TOKEN_SECRET);
        } catch (err) {
            // If token is invalid, it might have been compromised. For security, remove it.
            await RefreshTokens.deleteOne({ refreshToken: incoming });
            return res.status(403).json({ message: 'Invalid or expired refresh token. Please log in again.' });
        }

        // CORRECT: Access the nested UserInfo object
        const userIdFromToken = decoded.UserInfo?.userId;
        if (!userIdFromToken) {
            return res.status(403).json({ message: 'Token is malformed. Please log in again.' });
        }

        const foundUser = await Users.findById(userIdFromToken).exec();
        if (!foundUser) return res.status(401).json({ message: 'Unauthorized: User not found.' });

        // Use the centralized and consistent signTokenPair function
        const { accessToken, refreshToken } = signTokenPair(foundUser._id, foundUser.email, foundUser.roles);

        // Rotate the refresh token: update the existing one with the new one
        await upsertRefreshToken(foundUser._id, foundUser.email, refreshToken);

        return res.status(200).json({ accessToken, refreshToken });
    } catch (err) {
        console.error('Refresh error', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { handleRefreshToken };
