const mongoose = require('mongoose');
const Tutorials = require('../models/Tutorials');
const Lessons = require('../models/Lessons');

// @desc    Admin tạo một lesson mới cho một tutorial
// @route   POST /api/tutorials/:tutorialId/lessons
// @access  Admin
const handlerCreateLesson = async (req, res) => {
    try {
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { tutorialId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(tutorialId)) {
            return res.status(400).json({ message: "Invalid Tutorial ID" });
        }

        const tutorial = await Tutorials.findById(tutorialId);
        if (!tutorial) {
            return res.status(404).json({ message: "Tutorial not found" });
        }

        const { title, content, videoUrl } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: "Title and content are required" });
        }

        const newLesson = await Lessons.create({ title, content, videoUrl });

        // Thêm lesson mới vào danh sách của tutorial
        tutorial.lessons.push(newLesson._id);
        await tutorial.save();

        return res.status(201).json({
            message: "Lesson created and added to tutorial successfully",
            data: newLesson
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Admin cập nhật một lesson
// @route   PUT /api/lessons/:lessonId
// @access  Admin
const handlerUpdateLesson = async (req, res) => {
    try {
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { lessonId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            return res.status(400).json({ message: "Invalid Lesson ID" });
        }

        const { title, content, videoUrl } = req.body;
        const updates = { title, content, videoUrl };
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No update fields provided" });
        }

        const updatedLesson = await Lessons.findByIdAndUpdate(lessonId, updates, { new: true });

        if (!updatedLesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        return res.status(200).json({
            message: "Lesson updated successfully",
            data: updatedLesson
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Admin xóa một lesson
// @route   DELETE /api/lessons/:lessonId
// @access  Admin
const handlerDeleteLesson = async (req, res) => {
    try {
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { lessonId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(lessonId)) {
            return res.status(400).json({ message: "Invalid Lesson ID" });
        }

        const deletedLesson = await Lessons.findByIdAndDelete(lessonId);
        if (!deletedLesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        // Xóa lessonId khỏi tất cả các tutorial chứa nó
        await Tutorials.updateMany(
            { lessons: lessonId }, 
            { $pull: { lessons: lessonId } }
        );

        return res.status(200).json({ message: "Lesson deleted successfully" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Lấy tất cả lessons của một tutorial
// @route   GET /api/tutorials/:tutorialId/lessons
// @access  Public
const handlerGetLessonsForTutorial = async (req, res) => {
    try {
        const { tutorialId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(tutorialId)) {
            return res.status(400).json({ message: "Invalid Tutorial ID" });
        }

        const tutorial = await Tutorials.findById(tutorialId).populate('lessons');
        if (!tutorial || tutorial.hidden) {
            return res.status(404).json({ message: "Tutorial not found" });
        }

        return res.status(200).json({ data: tutorial.lessons });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { 
    handlerCreateLesson, 
    handlerUpdateLesson, 
    handlerDeleteLesson, 
    handlerGetLessonsForTutorial 
};