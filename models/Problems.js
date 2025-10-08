const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({

    title: { type: String, required: true, unique: true},
    slug: { type: String, unique: true, trim: true},
    description: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    tags: [String],
    examples: [
        { 
            input: { type: String, required: true, }, 
            output: { type: String, required: true, }, 
            explanation: String 
        }
    ],
    constraints: [String],//Giới hạn
    hints: [String],//Gợi ý
    testcases: [
        {
            input: { type: String, required: true },
            output: { type: String, required: true },
            isHidden: { type: Boolean, default: true },
        }
    ],
    likeCount: { type: Number, default: 0 },
    unlikeCount: { type: Number, default: 0},
    commentCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false},
    
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    stats: {
        totalSubmissions: { type: Number, default: 0},
        acceptedSubmissions: { type: Number, default: 0},
    }
}, { timestamps: true });

module.exports = mongoose.model('Problems', problemSchema);