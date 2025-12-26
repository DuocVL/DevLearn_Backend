const jwt = require('jsonwebtoken');
const RefreshTokens = require('../models/RefreshTokens');

/**
 * Creates a pair of new access and refresh tokens.
 * @param {string} userId - The user's ID.
 * @param {string} email - The user's email.
 * @param {Array<string>} roles - The user's roles.
 * @returns {{accessToken: string, refreshToken: string}}
 */
const signTokenPair = (userId, email, roles = ['user']) => {
    const payload = { 
        UserInfo: { 
            userId: userId,
            email: email,
            roles: roles
        }
    };

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

    return { accessToken, refreshToken };
};

/**
 * Creates or updates a refresh token in the database for a given user.
 * This ensures a user has only one valid refresh token at a time.
 * @param {string} userId - The user's ID.
 * @param {string} email - The user's email.
 * @param {string} token - The new refresh token.
 */
const upsertRefreshToken = async (userId, email, token) => {
    // Atomically find a document with the userId and update it, or create it if it doesn't exist.
    await RefreshTokens.findOneAndUpdate(
        { userId: userId }, // find a document with this filter
        { 
            userId: userId, 
            email: email, 
            refreshToken: token, 
            createdAt: new Date() // Update creation date on each new token
        }, // document to insert when find fails
        { upsert: true, new: true, setDefaultsOnInsert: true } // options
    );
};

module.exports = {
    signTokenPair,
    upsertRefreshToken,
};