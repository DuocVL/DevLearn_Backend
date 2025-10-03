const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshTokens = require('../models/RefreshTokens');

const handlerNewUser = async (req, res) => {
    const { username, email, password } = req.body;
    if(!username || !email || !password) {
        res.status(400).json(
            { 'message': "Username, Email, Password are required!"}
        );
    }
    try {
        //Kiểm tra trùng lặp
        const existsUsername = await User.findOne({ username });
        const existsEmail = await User.findOne({ email });
        if(existsUsername) return res.status(400).json({ 'message': "Username already used"});
        if(existsEmail) return res.status(400).json({ 'message': "Email already used"});
    } catch (err) { return res.status(500).json( { 'message': "Unable to connect to database"}); }  

    //Băm mật khẩu
    bcrypt.hash(password, 10, async (err, hash) => {
        if(err) { return next(err); }
        const newUser = await User.create({ provider: 'local', email: email, username: username, passwordHash: hash});
        return res.status(201).json({'message': 'Create user !', newUser });
    });

};

const handlerLogout = (req, res) => {
    
    const authHeader = req.headers['authorization'];
    if(!authHeader) return res.status(401).json({ message: "No authorization header" });
    const assetToken = authHeader.split(' ')[1];
    if(!assetToken) return res.status(401).json({ message: "No token provided" });
    
    jwt.verify(
        assetToken,
        process.env.JWT_ACCESS_TOKEN_SECRET,
        async (err, decoded) => {
            if(err) return res.status(403);
            const { deletedCount } = await RefreshTokens.deleteOne({email: decoded.email, id: decoded.id});
            if(deletedCount === 0) return res.status(403).json({ message: "Token not found or already deleted" });
            return res.status(200).json({ message: "Logout successful" });
        }
    );

};

module.exports = { handlerNewUser, handlerLogout };

