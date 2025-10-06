const jwt = require('jsonwebtoken');
const RefreshTokens = require('../models/RefreshTokens');
const { json } = require('express');

const handleRefreshToken = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if(!authHeader) return res.status(400).json({ 'message': 'Missing data!' });
        const refreshToken = authHeader.split(' ')[1];
        
        const tokenUser = await RefreshTokens.findOne({ refreshToken });
        if(!tokenUser) return res.status(401),json({ message: "Error" });
        
        jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_TOKEN_SECRET,
            (err, decoded) => {
                if(err) return res.status(500).json({ message: "Server error" });
                const accessToken = jwt.sign(
                    { userId: decoded.userId , email: decoded.email},
                    process.env.JWT_ACCESS_TOKEN_SECRET,
                    { expiresIn: '15m'}
                );
    
                return res.status(200).json({ accessToken });
            }
        );
    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
};

module.exports = { handleRefreshToken };