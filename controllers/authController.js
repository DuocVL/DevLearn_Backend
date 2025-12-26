const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Users = require('../models/User');
const RefreshTokens = require('../models/RefreshTokens');
const { sendResetPasswordEmail } = require('../services/emailServices');
const { signTokenPair, upsertRefreshToken } = require('../services/tokenService');
const { registerSchema, forgotPasswordSchema, resetPasswordSchema } = require('../validators/authSchemas');

const handlerNewUser = async (req, res) => {
    // 1. Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: 'Invalid input', details: error.details[0].message });
    }
    const { username, email, password } = value;

    try {
        // 2. Check for duplicates
        const existsUsername = await Users.findOne({ username });
        if (existsUsername) return res.status(409).json({ message: "Username already used" }); // 409 Conflict is more appropriate
        const existsEmail = await Users.findOne({ email });
        if (existsEmail) return res.status(409).json({ message: "Email already used" });

        // 3. Hash password and create user
        const hash = await bcrypt.hash(password, 10);
        const newUser = await Users.create({ provider: 'local', email, username, passwordHash: hash });
        
        // Exclude password hash from the response
        const userResponse = newUser.toObject();
        delete userResponse.passwordHash;

        return res.status(201).json({ message: 'User created successfully!', user: userResponse });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handleLogin = async (req, res) => {
    try {
      const user = req.user;
      const { accessToken, refreshToken } = signTokenPair(user._id, user.email, user.roles);
      await upsertRefreshToken(user._id, user.email, refreshToken);
      
      res.json({
          message: "Login successful!",
          user: { 
              _id: user._id,
              email: user.email,
              username: user.username,
              roles: user.roles,
              provider: user.provider
          },
          accessToken,
          refreshToken
      });
    } catch (err) {
      console.error('Login handler error:', err);
      res.status(500).json({ message: 'Internal server error during login process' });
    }
};

const handlerLogout = async (req, res) => {
    // Logout does not need validation as it checks for token existence
    try {
        const { refreshToken } = req.body || {};
        if (refreshToken) {
            await RefreshTokens.deleteOne({ refreshToken });
            return res.status(200).json({ message: 'Logout successful' });
        }
        return res.sendStatus(204); // No content, successful logout
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const handlerForgotPassword = async (req, res) => {
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: 'Invalid input', details: error.details[0].message });
    }
    const { email } = value;

    try {
        const user = await Users.findOne({ email });
        if (!user) {
            // Respond with success to prevent user enumeration
            return res.status(200).json({ message: "If a user with that email exists, a code has been sent." });
        }

        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        user.resetPasswordCode = code;
        user.resetPasswordExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
        await user.save();

        await sendResetPasswordEmail(user.email, user.username, code);

        return res.status(200).json({ message: "If a user with that email exists, a code has been sent." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handlerResetPassword = async (req, res) => {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: 'Invalid input', details: error.details[0].message });
    }
    const { email, code, newPassword } = value;

    try {
        const user = await Users.findOne({ 
            email, 
            resetPasswordCode: code,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        user.resetPasswordCode = undefined; // Use undefined to remove from mongo
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { handlerNewUser, handleLogin, handlerLogout, handlerForgotPassword, handlerResetPassword };
