const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    
    provider: {type: String, default: 'local'},//local | google | github
    providerId: String,//id 
    email: {type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    passwordHash: String, //Chỉ dùng cho local
    avatar: String,
    roles: { type: String, default: 'Student'},//quyền
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comments' }],
    savedTutorials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tutorials'}],//Danh sách các khóa học,
    savedProblems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problems' }],//Danh sách các vấn đề đã lưu,
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Posts' }], //Danh sách các bài viết đã lưu,

    },{
        timestamps: true
    }
);

module.exports = mongoose.model('User', userSchema);
