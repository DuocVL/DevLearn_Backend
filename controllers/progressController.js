const mongoose = require('mongoose');
const Progress = require('../models/Progress');
const Lessons = require('../models/Lessons');
const User = require('../models/User');

// @desc    Người dùng đánh dấu một lesson là đã hoàn thành
// @route   POST /api/progress/lessons/:lessonId
// @access  Private
const handlerMarkLessonAsComplete = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            return res.status(400).json({ message: "Invalid Lesson ID" });
        }

        const lesson = await Lessons.findById(lessonId);
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        const progress = await Progress.findOneAndUpdate(
            { userId: userId },
            { $addToSet: { completedLessons: lessonId } },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            message: "Lesson marked as completed successfully",
            data: progress
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Lấy toàn bộ tiến trình của người dùng đang đăng nhập
// @route   GET /api/progress
// @access  Private
const handlerGetMyProgress = async (req, res) => {
    try {
        const userId = req.user.id;

        // Lấy tiến trình học tập từ model Progress
        const learningProgress = await Progress.findOne({ userId: userId }).lean();

        // Lấy thông tin các bài tập đã giải từ model User
        // Chúng ta đã có req.user từ middleware, không cần query lại nếu không cần thiết
        const solvedProblems = req.user.solvedProblems || [];

        const response = {
            completedLessons: learningProgress ? learningProgress.completedLessons : [],
            completedProblems: solvedProblems
        };

        return res.status(200).json({ data: response });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { handlerMarkLessonAsComplete, handlerGetMyProgress };
