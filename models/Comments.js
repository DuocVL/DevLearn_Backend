const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({

    parentType: { type: String , required: true},
    parentId: { type: mongoose.Schema.Types.ObjectId, required: true},
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},
    content: { type: String, required: true },
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

module.exports = mongoose.model('Comments', commentSchema);