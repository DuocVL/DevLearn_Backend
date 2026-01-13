const mongoose = require('mongoose');
const Progress = require('../models/Progress');
const Lessons = require('../models/Lessons');

// @desc    Người dùng đánh dấu một lesson là đã hoàn thành
// @route   POST /api/progress/lessons/:lessonId
// @access  Private
const handlerMarkLessonAsComplete = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const userId = req.user.id; // Lấy từ middleware verifyJWT

        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            return res.status(400).json({ message: "Invalid Lesson ID" });
        }

        // Kiểm tra xem lesson có tồn tại không
        const lesson = await Lessons.findById(lessonId);
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        // Tìm hoặc tạo mới document progress cho user
        const progress = await Progress.findOneAndUpdate(
            { userId: userId },
            // Thêm lessonId vào mảng completedLessons, $addToSet để đảm bảo không có giá trị trùng lặp
            { $addToSet: { completedLessons: lessonId } },
            // Options: { new: true } trả về document đã cập nhật, { upsert: true } tạo mới nếu không tìm thấy
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

module.exports = { handlerMarkLessonAsComplete };