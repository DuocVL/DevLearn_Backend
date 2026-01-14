const mongoose = require('mongoose');
const Reactions = require('../models/Reactions');
const Posts = require('../models/Posts');
const Problems = require('../models/Problems');
const Lessons = require('../models/Lessons');
const Comments = require('../models/Comments');

// Map để liên kết targetType với Model tương ứng
const modelMap = {
    posts: Posts,
    problems: Problems,
    lessons: Lessons,
    comments: Comments,
};

// Hàm tiện ích để cập nhật likeCount/unlikeCount trên document gốc
async function updateTargetCounts(targetType, targetId, reaction, amount) {
    const Model = modelMap[targetType];
    if (!Model) throw new Error('Invalid targetType');

    const fieldToUpdate = reaction === 'like' ? 'likeCount' : 'unlikeCount';
    
    await Model.findByIdAndUpdate(targetId, { $inc: { [fieldToUpdate]: amount } });
}

// Xử lý việc thêm, sửa, xóa reaction một cách thông minh
const handlerToggleReaction = async (req, res) => {
    try {
        const { targetType, targetId, reaction: newReaction } = req.body;
        const userId = req.user.id;

        // --- Validation ---
        if (!targetType || !targetId || !newReaction) {
            return res.status(400).json({ message: 'targetType, targetId, and reaction are required.' });
        }
        if (!modelMap[targetType]) {
            return res.status(400).json({ message: 'Invalid targetType.' });
        }
        if (!['like', 'unlike'].includes(newReaction)) {
            return res.status(400).json({ message: "Reaction must be either 'like' or 'unlike'." });
        }
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'Invalid targetId.' });
        }

        const existingReaction = await Reactions.findOne({ userId, targetId, targetType });

        // --- Logic xử lý ---

        if (existingReaction) {
            // Người dùng đã có reaction trên đối tượng này
            if (existingReaction.reaction === newReaction) {
                // --- Hủy reaction (bấm like lần 2) ---
                await existingReaction.deleteOne();
                await updateTargetCounts(targetType, targetId, newReaction, -1);
                return res.status(200).json({ message: 'Reaction removed.' });
            } else {
                // --- Đổi reaction (từ like -> unlike hoặc ngược lại) ---
                const oldReaction = existingReaction.reaction;
                existingReaction.reaction = newReaction;
                await existingReaction.save();

                // Cập nhật cả 2 counts
                await updateTargetCounts(targetType, targetId, oldReaction, -1);
                await updateTargetCounts(targetType, targetId, newReaction, 1);

                return res.status(200).json({ message: 'Reaction updated.', data: existingReaction });
            }
        } else {
            // --- Thêm reaction mới ---
            const reaction = await Reactions.create({
                userId,
                targetId,
                targetType,
                reaction: newReaction,
            });
            await updateTargetCounts(targetType, targetId, newReaction, 1);
            return res.status(201).json({ message: 'Reaction added.', data: reaction });
        }

    } catch (err) {
        console.error("Error in toggleReaction:", err);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// Lấy danh sách user đã reaction vào một đối tượng
const handlerGetUsersWhoReacted = async (req, res) => {
    try {
        const { targetType, targetId } = req.query;

        // --- Validation ---
        if (!targetType || !targetId) {
            return res.status(400).json({ message: 'targetType and targetId are required query parameters.' });
        }
        if (!modelMap[targetType]) {
            return res.status(400).json({ message: 'Invalid targetType.' });
        }

        const reactions = await Reactions.find({ targetType, targetId })
            .populate('userId', 'username avatar') // Lấy username và avatar của user
            .lean(); // Sử dụng lean() để tăng tốc độ

        res.status(200).json({ data: reactions });

    } catch (err) {
        console.error("Error getting users who reacted:", err);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

module.exports = { handlerToggleReaction, handlerGetUsersWhoReacted };
