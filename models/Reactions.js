const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({

    userId: { type: mongoose.Schema.Types.ObjectId, required: true, },
    targetType: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, },
    reaction: { type: String, default: 'Like' },
    createdAt: { type: Date, default: Date.now},
});

module.exports = mongoose.model('Reactions', reactionSchema);