const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({

    lessonId: {type: mongoose.Schema.Types.ObjectId, req: 'Lessons'},
    question: {type: String, required: true},
    options: [
        { text: String, isCorrect: Boolean}
    ],
    explanation: String,
    },{ timestamps: true, }
);

module.exports = mongoose.model('Tests', testSchema);