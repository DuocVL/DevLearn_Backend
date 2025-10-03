const jwt = require('jsonwebtoken');

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if(!authHeader) return res.status(401).json({ message: "Missing or incorrect token"});

    const assetToken = authHeader.split(' ')[1];
    if(!assetToken) return res.status(401).json({ message: "Missing or incorrect token"});

    jwt.verify(
        assetToken,
        process.env.JWT_ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if(err) return res.status(403).json({ message: "Authentication error"});
            req.userId = decoded.id;
            next();
        }
    );
};

module.exports = verifyJWT