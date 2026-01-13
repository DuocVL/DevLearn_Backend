const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    
    provider: {type: String, default: 'local'},//local | google | github
    providerId: String,//id 
    email: {type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    passwordHash: String, //Chỉ dùng cho local
    avatar: String,
    roles: { type: String, enum:["user", "admin"] , default: 'user'},//quyền
    savedTutorials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tutorials'}],//Danh sách các khóa học,
    savedProblems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problems' }],//Danh sách các vấn đề đã lưu,
    solvedProblems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problems' }], // <-- THÊM TRƯỜNG NÀY
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Posts' }], //Danh sách các bài viết đã lưu,

    //Dùng cho reset password
    resetPasswordCode: String,
    resetPasswordExpires: Date,
    //Dùng cho xác minh email
    verifyToken: String,
    verified: { type: Boolean, default: false },

    },{
        timestamps: true
    }
);

module.exports = mongoose.model('Users', userSchema);
