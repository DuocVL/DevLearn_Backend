const mongoose = require('mongoose');

const submissionsSchema = new mongoose.Schema({

    problemId: {type: mongoose.Schema.Types.ObjectId, ref: 'Problems', required: true},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true},
    language: { type: String, required: true , enum:['cpp', 'python', 'javascript', 'java'] }, // vd: cpp, python, java
    code: { type: String, required: true },

    // Trạng thái chấm bài
    status: {
        type: String,
        enum: [
            'Accepted',
            'Running',
            'Wrong Answer',
            'Time Limit Exceeded',
            'Runtime Error',
            'Memory Limit Exceeded',
            'Compilation Error'
        ],
        default: 'Pending'
    },
    // Thông tin chi tiết về kết quả chạy
    result: {
        passedCount: { type: Number, default: 0 },
        totalCount: { type: Number, default: 0 },
        failedTestcases: {
            input: String,
            expectedOutput: String,
            userOutput: String,
        }
    },

    // Thống kê
    runtime: { type: Number, default: 0 }, // tổng thời gian chạy (ms)
    memory: { type: Number, default: 0 },  // bộ nhớ tiêu thụ (MB)
    }, { timestamps: true }
);

module.exports = mongoose.model('Submissions', submissionsSchema);