const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    
    name: {type: String, unique: true, require: true},
    description: String,
    relatedProblems: Array,
});

module.exports = mongoose.model('Skills', skillSchema);