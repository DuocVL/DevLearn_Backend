const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyJWT =  (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if(!authHeader) return res.status(401).json({ message: "Missing or incorrect token"});

    const accessToken = authHeader.split(' ')[1];
    if(!accessToken) return res.status(401).json({ message: "Missing or incorrect token"});

    jwt.verify(
        accessToken,
        process.env.JWT_ACCESS_TOKEN_SECRET,
        async (err, decoded) => {
            if(err) return res.status(403).json({ message: "Authentication error"});
            const user = await User.findById(decoded.UserInfo.userId);
            req.user = user;
            next();
        }
    );
};

module.exports = verifyJWT