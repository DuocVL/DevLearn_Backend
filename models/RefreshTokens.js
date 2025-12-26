const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({

    refreshToken: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, sparse: true },
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 3600 } // Thời gian tồn tại refreshToken là 7 ngày
});

module.exports = mongoose.model('RefreshTokens', refreshTokenSchema);