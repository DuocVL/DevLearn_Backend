const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware này cố gắng xác thực người dùng nếu có token,
// nhưng không báo lỗi nếu không có token hoặc token không hợp lệ.
// Nó chỉ đơn giản là gắn req.user nếu thành công.
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        // Không có header, đi tiếp
        return next();
    }

    const accessToken = authHeader.split(' ')[1];
    if (!accessToken) {
        // Không có token, đi tiếp
        return next();
    }

    jwt.verify(
        accessToken,
        process.env.JWT_ACCESS_TOKEN_SECRET,
        async (err, decoded) => {
            if (err) {
                // Token không hợp lệ, bỏ qua và đi tiếp
                return next();
            }
            try {
                const user = await User.findById(decoded.UserInfo.userId);
                if (user) {
                    req.user = user; // Gắn người dùng nếu tìm thấy
                }
            } catch (dbError) {
                // Lỗi database, bỏ qua và đi tiếp
                console.error("Optional Auth DB Error:", dbError);
            }
            next(); // Luôn luôn đi tiếp
        }
    );
};

module.exports = optionalAuth;
