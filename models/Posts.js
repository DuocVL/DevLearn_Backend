const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({

    title: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Users' }, // Đổi ref thành 'Users' để khớp với tên model User của bạn
    tags: [String],
    
    // Trạng thái của bài viết
    status: {
        type: String,
        enum: ['published', 'draft'],
        default: 'published',
    },

    // Cờ cho việc xóa mềm
    isDeleted: { type: Boolean, default: false },

    // Các trường metadata khác
    likeCount: { type: Number, default: 0 },
    unlikeCount: { type: Number, default: 0},
    hidden: { type: Boolean, default: false}, // Cân nhắc xem có nên giữ lại khi đã có status và isDeleted
    anonymous: { type: Boolean, default: false},
    commentCount: { type: Number, default: 0 },
    views: { type: Number, default: 0},
    
    // Trường authorName không cần thiết vì chúng ta có thể populate từ authorId
    // authorName: { type: String },

    },{ timestamps: true, }
);

// Thêm index cho các trường thường xuyên được truy vấn
postSchema.index({ isDeleted: 1, status: 1 });
postSchema.index({ tags: 1 });

module.exports = mongoose.model('Posts', postSchema);
