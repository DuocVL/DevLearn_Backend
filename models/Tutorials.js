const mongoose = require('mongoose');

const tutorialSchema = new mongoose.Schema({

    title: {type: String, required: true},
    languageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProgLangs'},
    description: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},
    tags: [String],
    likes: Number,
    views: Number,
    lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lessons'}],},{
        timestamps: true,
    }

);

module.exports = mongoose.model('Tutorials', tutorialSchema);