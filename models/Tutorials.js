const mongoose = require('mongoose');

const tutorialSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    authorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Users'
    },
    tags: [String],
    totalViews: {
        type: Number,
        default: 0
    },
    lessons: [{ // Một khóa học có nhiều bài học
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lessons'
    }],
    hidden: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Tutorials', tutorialSchema);
