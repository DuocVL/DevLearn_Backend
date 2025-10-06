const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyJWT =  (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if(!authHeader) return res.status(401).json({ message: "Missing or incorrect token"});

    const assetToken = authHeader.split(' ')[1];
    if(!assetToken) return res.status(401).json({ message: "Missing or incorrect token"});

    jwt.verify(
        assetToken,
        process.env.JWT_ACCESS_TOKEN_SECRET,
        async (err, decoded) => {
            if(err) return res.status(403).json({ message: "Authentication error"});
            const user = await User.findById(decoded.userId);
            req.user = user;
            next();
        }
    );
};

module.exports = verifyJWT