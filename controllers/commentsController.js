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

        if(!comment.userId.equals(req.user._id)) return res.status(403).json({ message: "Forbidden: Not your comment" });

        if(comment.isDeleted) return res.status(400).json({ message: "Comment deleted"});

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

        if(!comment.userId.equals(req.user._id)) return res.status(403).json({ message: "Forbidden: Not your comment" });

        await updateCollection(comment.targetId, comment.targetType, -1);
        
        await Comments.findByIdAndUpdate(
            commentId,
            {
                content: "comment đã xóa",
                isDeleted: true,
            }
        );

        return res.status(200).json({ message: "Comment deleted" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


//Lấy danh sách comment
const handlerGetListComment = async (req, res) => {
    try {
        const { targetId, targetType } = req.params;
        if(!targetId || !targetType) return res.status(400).json({ message: "Missing required fields" });
    
        if(!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: "Invalid parentCommentId" });
    
        const { page = 1,limit = 20  } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Comments.countDocuments({
            targetId,
            targetType,
            isDeleted: false,
            hidden: false
        });
 
        const listcomment = await Comments.find(
            { 
                targetId: targetId,
                targetType: targetType,
                isDeleted: false,
                hidden: false,

            }
        )
        .populate({
            path: "userId",
            select: "username avatar",
        })
        .sort({ createdAt: -1})
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        return res.status(200).json({
            data: listcomment ,
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
    
        const { page = 1,limit = 20  } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const replies = await Comments.find(
            { 
                parentCommentId: parentCommentId ,
                isDeleted: false,
                hidden: false,

            }
        )
        .populate({
            path: "userId",
            select: "username avatar",
            
        })
        .sort({ createdAt: -1})
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        return res.status(200).json({ data: replies });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }

};


module.exports = { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerGetListComment, handlerGetReply };