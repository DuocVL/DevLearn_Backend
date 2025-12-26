const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
    userId: { type: mongoose.Types.ObjectId, required: true, ref: 'Users' },
    tutorialId: { type: mongoose.Types.ObjectId, required: true, ref: 'Tutorials' },
    completedLessons: [ mongoose.Types.ObjectId ]},
    { timestamps: true }
);

module.exports = mongoose.model('Progresses', progressSchema);