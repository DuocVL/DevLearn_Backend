const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({

    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lessons'},
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Posts'},
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},
    content: String,
    likes: { type: Number, default: 0 },
    commentsReply: Number,
    replies: [{
        userIdReply: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},//Id người reply
        userIdSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},//Id người được reply
        content: String,
        createdAt: { type: Date, default: Date.now }
    }]
    },{
        timestamps: true,
    }
);

module.exports = mongoose.Model('Comments', commentSchema);