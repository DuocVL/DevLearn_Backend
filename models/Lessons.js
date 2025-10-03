const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({

    tutorialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutorials' },
    title: { type: String, required: true },
    content: String,
    order: Number,
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    tests: [{ type: mongoose.Schema.Types.ObjectId, def: 'Tests' }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, def: 'Comments' }]
}, { timestamps: true}

);

module.exports = mongoose.model('Lessons', lessonSchema);