const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({

    title: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    tags: [String],
    description: String,
    examples: [{ input: String, output: String, explanation: String }],
    constraints: [String],
    solutions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tutorials' }],
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
}, { timestamps: true });

module.exports = mongoose.Model('Problems', problemSchema);