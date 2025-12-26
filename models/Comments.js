const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({

    targetType: { type: String, required: true, enum: ["posts", "problems", "lessons"]},
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true},
    parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comments", default: null},
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
    authorName: { type: String , required: true },
    content: { type: String, required: true, trim: true, maxlength: 200 },
    likeCount: { type: Number, default: 0 },
    unlikeCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    isDeleted: {type: Boolean, default: false},
    anonymous: { type: Boolean, default: false },//Ẩn danh người đăng   
    hidden: { type: Boolean, default: false },
    },{ timestamps: true, }
);

module.exports = mongoose.model('Comments', commentSchema);