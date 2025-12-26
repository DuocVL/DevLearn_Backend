const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({

    tutorialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutorials' },
    title: { type: String, required: true },
    content: { type: String, required: true },
    order: { type: Number, required: true},
    likeCount: { type: Number, default: 0 },
    unlikeCount: { type: Number, default: 0},
    views: { type: Number, default: 0 },
}, { timestamps: true}

);

module.exports = mongoose.model('Lessons', lessonSchema);