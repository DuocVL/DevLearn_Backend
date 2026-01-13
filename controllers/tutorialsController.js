const mongoose = require('mongoose');
const Tutorials = require('../models/Tutorials');
const User = require('../models/User');

// @desc    Admin tạo một tutorial mới
// @route   POST /api/tutorials
// @access  Admin
const handlerCreateTutorial = async (req, res) => {
    try {
        // Chỉ admin mới có quyền tạo
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { title, description, tags, lessons, hidden } = req.body;
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }

        const existed = await Tutorials.findOne({ title });
        if (existed) {
            return res.status(409).json({ message: "Title already taken" });
        }

        const newTutorial = await Tutorials.create({
            title,
            description,
            tags,
            lessons,
            hidden,
            authorId: req.user._id
        });

        return res.status(201).json({
            message: "Tutorial created successfully",
            data: newTutorial
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Admin cập nhật một tutorial
// @route   PUT /api/tutorials/:tutorialId
// @access  Admin
const handlerUpdateTutorial = async (req, res) => {
    try {
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { tutorialId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(tutorialId)) {
            return res.status(400).json({ message: "Invalid tutorialId" });
        }

        const tutorial = await Tutorials.findById(tutorialId);
        if (!tutorial) {
            return res.status(404).json({ message: "Tutorial not found" });
        }

        // Lấy các trường có thể cập nhật từ body
        const { title, description, tags, lessons, hidden } = req.body;
        const updates = { title, description, tags, lessons, hidden };

        // Loại bỏ các trường không được cung cấp (undefined) để không ghi đè giá trị hiện có
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
        
        // Kiểm tra title mới nếu có thay đổi
        if (updates.title && updates.title !== tutorial.title) {
            const existed = await Tutorials.findOne({ title: updates.title });
            if (existed) {
                return res.status(409).json({ message: "New title already taken" });
            }
        }

        const updatedTutorial = await Tutorials.findByIdAndUpdate(tutorialId, updates, { new: true });

        return res.status(200).json({
            message: "Tutorial updated successfully",
            data: updatedTutorial
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Admin xóa một tutorial
// @route   DELETE /api/tutorials/:tutorialId
// @access  Admin
const handlerDeleteTutorial = async (req, res) => {
    try {
        if (req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Not authorized" });
        }

        const { tutorialId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(tutorialId)) {
            return res.status(400).json({ message: "Invalid tutorialId" });
        }

        const deleted = await Tutorials.findByIdAndDelete(tutorialId);
        if (!deleted) {
            return res.status(404).json({ message: "Tutorial not found" });
        }
        
        // TODO: Cân nhắc xóa tutorial này khỏi danh sách đã lưu của người dùng

        return res.status(200).json({ message: "Tutorial deleted successfully" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Lấy danh sách các tutorials (có phân trang)
// @route   GET /api/tutorials
// @access  Public
const handlerGetListTutorials = async (req, res) => {
    try {
        const { page = 1, limit = 20, tag } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const filter = { hidden: { $ne: true } };
        if (tag) filter.tags = tag;

        const total = await Tutorials.countDocuments(filter);
        const tutorials = await Tutorials.find(filter)
            .populate('authorId', 'username avatar') // Lấy thông tin tác giả
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        // Kiểm tra xem người dùng có lưu tutorial nào không
        const user = req.user || null;
        const userSaved = (user && Array.isArray(user.savedTutorials)) ? user.savedTutorials.map(String) : [];

        const summaries = tutorials.map(t => ({
            id: t._id,
            title: t.title,
            description: t.description,
            tags: t.tags,
            author: t.authorId,
            totalViews: t.totalViews,
            lessonCount: t.lessons.length,
            saved: user ? userSaved.includes(String(t._id)) : false, // Kiểm tra đã lưu chưa
            createdAt: t.createdAt
        }));

        return res.status(200).json({
            data: summaries,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// @desc    Lấy chi tiết một tutorial theo ID
// @route   GET /api/tutorials/:tutorialId
// @access  Public
const handlerGetTutorialById = async (req, res) => {
    try {
        const { tutorialId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(tutorialId)) {
            return res.status(400).json({ message: "Invalid Tutorial ID" });
        }

        const tutorial = await Tutorials.findById(tutorialId)
            .populate('authorId', 'username avatar')
            .populate('lessons', 'title description'); // Lấy chi tiết các bài học

        if (!tutorial || tutorial.hidden === true) {
            return res.status(404).json({ message: "Tutorial not found" });
        }
        
        // Tăng lượt xem
        tutorial.totalViews += 1;
        await tutorial.save();

        return res.status(200).json({ data: tutorial });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { 
    handlerCreateTutorial, 
    handlerUpdateTutorial, 
    handlerDeleteTutorial, 
    handlerGetListTutorials, 
    handlerGetTutorialById
};