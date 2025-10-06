const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({

    title: { type: String, required: true },
    content: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, required:true, ref: 'Users' },
    tags: [String],
    likeCount: { type: Number, default: 0 },
    unlikeCount: { type: Number, default: 0},
    hidden: { type: Boolean, default: false},//Ẩn bài viết
    anonymous: { type: Boolean, default: false},//Ẩn danh người đăng
    commentCount: { type: Number, default: 0 },
    views: { type: Number, default: 0},
    },{ timestamps: true, }
);

module.exports = mongoose.model('Posts', postSchema);