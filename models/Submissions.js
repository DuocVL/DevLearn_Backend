const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    problemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Problem',
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    language: {
        type: String,
        required: true,
    },
    code: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        default: 'Pending', // Pending, Running, Accepted, Wrong Answer, Runtime Error, Time Limit Exceeded
    },
    // Thông tin chi tiết về kết quả chạy
    result: {
        passedCount: { type: Number, default: 0 },
        totalCount: { type: Number, default: 0 },
        failedTestcase: { // <<< SỬA TẠI ĐÂY: từ số nhiều thành số ít
            input: String,
            expectedOutput: String,
            userOutput: String,
        },
        error: String, // Để lưu thông điệp lỗi của Runtime Error
    },

    // Thống kê
    runtime: { type: Number, default: 0 }, // tổng thời gian chạy (ms)
    memory: { type: Number, default: 0 }, // bộ nhớ sử dụng (KB)
}, { timestamps: true });

module.exports = mongoose.model('Submission', submissionSchema);
