const mongoose = require('mongoose');

const tutorialSchema = new mongoose.Schema({

    title: {type: String, required: true},
    description: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users'},
    tags: [String],
    totalViews: Number,
    },{timestamps: true,}

);

module.exports = mongoose.model('Tutorials', tutorialSchema);