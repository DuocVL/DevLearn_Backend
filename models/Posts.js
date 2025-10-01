const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({

    title: { type: String, required: true },
    content: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    tags: [String],
    likes: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comments' }]
},
    {
        timestamps: true,
    }
);

module.exports = mongoose.Model('Posts', postSchema);