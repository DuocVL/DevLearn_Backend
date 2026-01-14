const User = require('../models/User');
const Progress = require('../models/Progress');
const mongoose = require('mongoose');

// @desc    Lấy thông tin profile của người dùng đang đăng nhập
// @route   GET /api/users/profile
// @access  Private
const getMyProfile = async (req, res) => {
    try {
        // req.user đã được đính kèm từ middleware verifyJWT
        const user = await User.findById(req.user.id).select('-passwordHash -email');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Lấy thông tin hồ sơ công khai của một người dùng
// @route   GET /api/users/:userId/profile
// @access  Public
const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid User ID" });
        }

        const user = await User.findById(userId).select('username avatar createdAt solvedProblems').lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const learningProgress = await Progress.findOne({ userId: userId }).lean();

        // Xây dựng đối tượng hồ sơ công khai
        const profile = {
            _id: user._id,
            username: user.username,
            avatar: user.avatar,
            memberSince: user.createdAt,
            stats: {
                problemsSolved: user.solvedProblems ? user.solvedProblems.length : 0,
                lessonsCompleted: learningProgress && learningProgress.completedLessons ? learningProgress.completedLessons.length : 0,
            }
        };

        res.json({ data: profile });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = { getMyProfile, getUserProfile };