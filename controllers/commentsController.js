const Comments = require('../models/Comments');

const handlerAddComment = async (req, res) => {
    try {
        const { parentType, parentId, content } = req.query;
        if(!parentType || !parentId || !content) return res.status(400).json({ message: "ParentType & ParentId are required" });
        if(!content) return res.status(400).json({ message: "Comment is empty" });
        const comments = await Comments.create(
            {
                parentType: parentType,
                parentId: parentId,
                userId: req.userId,
                content: content,
            }
        );
        //!Ghi vào User, parent

        return res.status(201).json({ message: "Comment created" , comments});
    } catch (err) {
        return res.status(500).json({ message: "Error creating comment" });
    }
};

const handlerUpdateComment = async (req, res) => {
    try {
        const commentId = req.params.commentId;
        if(!commentId) return res.status(400).json({ message: "CommentId is required" });
        const comment = Comments.findById(commentId);
        if(!comment) return res.status(404).json({ message: "Tài nguyên không tồn tại" });
    } catch (err) {
        
    }
};

//! Lỗi xác minh
const handlerDeleteComment = async (req, res) => {
    try {
        const commentId = req.params.commentId;
        if(!commentId) return res.status(400).json({ message: "CommentId is required" });
        const comment = await Comments.findById(commentId);
        if(!comment) return res.status(404).json({ message: "Tài nguyên không tồn tại" });
        if(comment.userId.equals(req.userId, {toString})) return res.status(403).json({ message: "Không có quyền xóa tài nguyên" });//!!! xem lại
        await comment.deleteOne();
        return res.status(201).json({ message: "Comment deleted" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error deleting comment" });
    }
};

//Xử lí like,unlike
const handlerLikeComment = async (req, res) => {
    
};

//Xử lí Reply
const handlerAddReply = async (req, res) => {

};

const handlerUpdateReply = async (req, res) => {

};

const handlerDeleteReply = async (req, res) => {

};

const handlerLikeReply = async (req, res) => {

};


module.exports = { handlerAddComment, handlerUpdateComment, handlerDeleteComment, handlerLikeComment, handlerAddReply, handlerUpdateReply, handlerDeleteReply, handlerLikeReply };