const mongoose = require('mongoose');
const Comments = require('../models/Comments');
const Posts = require('../models/Posts');
const Problems = require('../models/Problems');
const Lessons = require('../models/Lessons');

const map = {
    posts: Posts,
    problems: Problems,
    lessons: Lessons,
}
async function updateCollection(targetId, targetType, number) {
    const model = map[targetType];
    if(!model) throw new Error("Invalid targetType");
    await model.updateOne({_id: targetId}, { $inc: { commentCount: number }});
}

//Thêm bình luận mới
const handlerAddComment = async (req, res) => {
    try {
        const { targetType, targetId, parentCommentId, content, anonymous } = req.body;
        if(!targetId || !targetType || !content ) return res.status(400).json({ message: "Missing required fields" });

        if(!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: "Invalid targetId" });

        if(parentCommentId && !mongoose.Types.ObjectId.isValid(parentCommentId)) return res.status(400).json({ message: "Invalid parentCommentId" });
        const commentNew = await Comments.create(
            {
                targetId: targetId,
                targetType: targetType,
                parentCommentId: parentCommentId ,
                userId: req.user._id,
                content: content,
                anonymous: anonymous,
            }
        );

        await updateCollection(targetId, targetType, 1);
        if(parentCommentId){
            await Comments.updateOne({ _id: parentCommentId }, { $inc: {replyCount: 1}});
        }

        return res.status(201).json({ message: "Comment created successfully", data: commentNew});

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

//Chỉnh sủa bình luận
const handlerUpdateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        if(!commentId || !content) return res.status(400).json({ message: "Missing required fields" });

        if(!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ message: "Invalid commentId" });

        const comment = await Comments.findById(commentId);
        if(!comment) return res.status(404).json({ message: "Comment not found" });

        // CHO PHÉP ADMIN HOẶC CHỦ SỞ HỮU
        if(!comment.userId.equals(req.user._id) && req.user.roles !== 'admin') {
            return res.status(403).json({ message: "Forbidden: You do not have permission to update this comment" });
        }

        if(comment.isDeleted) return res.status(400).json({ message: "Cannot update a deleted comment"});

        const commentNew = await Comments.findByIdAndUpdate(
            commentId,
            { content: content },
            {new: true},
        );

        return res.status(200).json({message: "Comment updated successfully", data: commentNew});
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Xóa bình luận
const handlerDeleteComment = async (req, res) => {
    try {
        const commentId = req.params.commentId;
        if(!commentId) return res.status(400).json({ message: "Missing required fields" });

        if(!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ message: "Invalid commentId" });

        const comment = await Comments.findById(commentId);
        if(!comment) return res.status(404).json({ message: "Comment not found" });
        if(comment.isDeleted) return res.status(400).json({ message: "Comment already deleted" });

        // CHO PHÉP ADMIN HOẶC CHỦ SỞ HỮU
        if(!comment.userId.equals(req.user._id) && req.user.roles !== 'admin') {
             return res.status(403).json({ message: "Forbidden: You do not have permission to delete this comment" });
        }

        // Giảm commentCount trên target cha (Post, Problem...)
        await updateCollection(comment.targetId, comment.targetType, -1);
        
        // NẾU LÀ REPLY, GIẢM REPLYCOUNT TRÊN COMMENT CHA
        if(comment.parentCommentId){
            await Comments.updateOne({ _id: comment.parentCommentId }, { $inc: {replyCount: -1}});
        }

        await Comments.findByIdAndUpdate(
            commentId,
            {
                content: "This comment has been deleted.",
                isDeleted: true,
                anonymous: false, // Xóa trạng thái ẩn danh khi đã xóa
                userId: null // Xóa liên kết đến user
            }
        );

        return res.status(200).json({ message: "Comment deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Xử lý ẩn danh cho bình luận
const sanitizeComments = (comments) => {
    return comments.map(comment => {
        if (comment.anonymous) {
            // Thay thế thông tin user thật bằng thông tin ẩn danh
            comment.userId = {
                _id: null,
                username: 'Anonymous',
                avatar: '' // URL tới avatar mặc định
            };
        }
        delete comment.anonymous; // Xóa trường anonymous khỏi output
        return comment;
    });
}

//Lấy danh sách comment
const handlerGetListComment = async (req, res) => {
    try {
        const { targetId, targetType } = req.params;
        if(!targetId || !targetType) return res.status(400).json({ message: "Missing required fields" });
    
        if(!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: "Invalid targetId" });
    
        const { page = 1,limit = 20  } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {
            targetId,
            targetType,
            parentCommentId: null, // Chỉ lấy comment gốc
        };

        const total = await Comments.countDocuments(query);
 
        let listcomment = await Comments.find(query)
        .populate({
            path: "userId",
            select: "username avatar",
        })
        .sort({ createdAt: -1})
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        return res.status(200).json({
            data: sanitizeComments(listcomment),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalComments: total
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

//Lây danh sách phản hồi 1 comment
const handlerGetReply = async (req, res) => {
    try {
        const { parentCommentId } = req.params;
        if(!parentCommentId) return res.status(400).json({ message: "Missing required fields" });
    
        if(!mongoose.Types.ObjectId.isValid(parentCommentId)) return res.status(400).json({ message: "Invalid parentCommentId" });
    
        const { page = 1,limit = 10 } = req.query; // Giới hạn ít hơn cho reply
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let replies = await Comments.find({ parentCommentId: parentCommentId })
        .populate({
            path: "userId",
            select: "username avatar",
        })
        .sort({ createdAt: 1}) // Sắp xếp từ cũ đến mới cho reply
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        return res.status(200).json({ data: sanitizeComments(replies) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }

};


module.exports = { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerGetListComment, handlerGetReply };