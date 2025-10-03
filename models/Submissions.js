const mongoose = require('mongoose');

const submissionsSchema = new mongoose.Schema({

    problemId: {type: mongoose.Schema.Types.ObjectId, ref: 'Problems'},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'Users'},
    language: String ,
    code: String,
    status: { type: String, enum: ['Accepted', 'Wrong Answer', 'Time Limit Exceeded']},
    runtime: String,
    memory: String}, 
    { timestamps: true }
);

module.exports = mongoose.model('Submissions', submissionsSchema);