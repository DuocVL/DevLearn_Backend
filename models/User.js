const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    provider: {type: String, default: 'local'},//local | google | github
    providerId: String,//id 
    email: {type: String, require: true, unique:true },
    username: { type: String, require: true, unique:true },
    passwordHash: String, //Chỉ dùng cho local
    avatar: String,
    createAt: {type: Date, default: Date.now}
});

module.exports = mongoose.model('User', userSchema);
