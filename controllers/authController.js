const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Users = require('../models/User');
const RefreshTokens = require('../models/RefreshTokens');
const { sendResetPasswordEmail } = require('../services/emailServices');

const handlerNewUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if(!username || !email || !password) {
            res.status(400).json(
                { 'message': "Username, Email, Password are required!"}
            );
        }
        
        //Kiểm tra trùng lặp
        const existsUsername = await Users.findOne({ username });
        const existsEmail = await Users.findOne({ email });
        if(existsUsername) return res.status(400).json({ 'message': "Username already used"});
        if(existsEmail) return res.status(400).json({ 'message': "Email already used"});
       
        //Băm mật khẩu
        bcrypt.hash(password, 10, async (err, hash) => {
            if(err) { return next(err); }
            const newUser = await Users.create({ provider: 'local', email: email, username: username, passwordHash: hash});
            return res.status(201).json({'message': 'Create user !', newUser });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }

};

const handlerLogout = (req, res) => {
    
    try {
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
    
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handlerForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if(!email) return res.status(400).json({ message: "Missing required fields"});

        const user = await Users.findOne({ email });
        if(!user) return res.status(404).json({ message: "User not found"});

        //Tạo mã 6 kí tự
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();

        //Cập nhật vào DB
        user.resetPasswordCode = code;
        user.resetPasswordExpires = Date.now() + 5 * 60 * 1000;//5 phút tồn tại
        await user.save();

        //Gửi email
        await sendResetPasswordEmail(user.email, user.username, code);

        return res.status(200).json({ message: "Verification code sent via email" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }

}

const handlerResetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if(!email || !code || !newPassword ) return res.status(400).json({ message: 'Missing required fields' });

        const user = await Users.findOne({ email });
        if(!user) return res.status(404).json({ message: "User not found. "});

        if(user.resetPasswordCode !== code || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()){
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        //Băm mật khẩu
        bcrypt.hash(newPassword, 10, async (err, hash) => {
            if(err) { return next(err); }

            user.passwordHash = hash;
            user.resetPasswordCode = null;
            user.resetPasswordExpires = null;
            await user.save();

            return res.status(200).json({ message: 'Password reset successful' });
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { handlerNewUser, handlerLogout, handlerForgotPassword, handlerResetPassword };

