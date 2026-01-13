const mongoose = require('mongoose');

const testcaseSchema = new mongoose.Schema({
    input: { type: String, default: '' },
    output: { type: String, required: true },
    isHidden: { type: Boolean, default: false }
});

const codeTemplateSchema = new mongoose.Schema({
    language: { type: String, required: true },
    template: { type: String, required: true } // Full code with a placeholder like //{{USER_CODE}}
});

const starterCodeSchema = new mongoose.Schema({
    language: { type: String, required: true },
    code: { type: String, required: true }      // Code shown to the user in the editor
});

const problemsSchema = new mongoose.Schema({
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
    tags: [String],
    testcases: [testcaseSchema],
    timeLimit: { type: Number, default: 2 }, // Time limit in seconds. Default is 2s.
    
    // -- NEW: LeetCode-style templating fields --
    codeTemplates: [codeTemplateSchema],
    starterCode: [starterCodeSchema],
    // ------------------------------------------

    totalSubmissions: { type: Number, default: 0 },
    acceptedSubmissions: { type: Number, default: 0 },

}, { timestamps: true });

module.exports = mongoose.model('Problems', problemsSchema);
