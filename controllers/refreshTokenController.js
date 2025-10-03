const jwt = require('jsonwebtoken');
const RefreshTokens = require('../models/RefreshTokens');

const handleRefreshToken = async (req, res) => {
    const authHeader = req.headers['authorization'];
    if(!authHeader) return res.status(400).json({ 'message': 'Missing data!' });
    const refreshToken = authHeader.split(' ')[1];
    
    const tokenUser = await RefreshTokens.findOne({ refreshToken });
    if(!tokenUser) return res.status(401);
    
    jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_TOKEN_SECRET,
        (err, decoded) => {
            
            if(err || tokenUser.id.$oid !== decoded.id.$oid || tokenUser.email !== decoded.email) return res.status(403);
            const accessToken = jwt.sign(
                { id: tokenUser.id, email: tokenUser.email},
                process.env.JWT_ACCESS_TOKEN_SECRET,
                { expiresIn: '15m'}
            );

            return res.status(200).json({ accessToken });
        }
    );
};

module.exports = { handleRefreshToken };