const mongoose = require('mongoose');

const proglangSchema = new mongoose.Schema({
    
    name: {type: String, unique: true, require: true},
    description: String,
    logoUrl: String,
});

module.exports = mongoose.model('ProgLangs', proglangSchema);