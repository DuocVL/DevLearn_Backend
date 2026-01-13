const mongoose = require('mongoose');
const Problems = require('../models/Problems');

const handlerCreateProblems = async (req, res) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ message: "Not authorized" });

        const { title, slug, description, difficulty, tags, examples, constraints, hints, testcases } = req.body;
        if (!title || !description)
            return res.status(400).json({ message: "Missing required fields" });

        const existed = await Problems.findOne({ title });
        if (existed)
            return res.status(409).json({ message: "Title already taken" });

        const newProblem = await Problems.create({
            title,
            slug,
            description,
            difficulty,
            tags,
            examples,
            constraints,
            hints,
            testcases,
            authorId: req.user._id
        });

        return res.status(201).json({
            message: "Problem created successfully",
            data: newProblem
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const handlerUpdateProblems = async (req, res) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ message: "Not authorized" });

        const { problemId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(problemId))
            return res.status(400).json({ message: "Invalid problemId" });

        const updates = req.body;
        const problem = await Problems.findById(problemId);
        if (!problem)
            return res.status(404).json({ message: "Problem not found" });

        Object.assign(problem, updates);
        await problem.save();

        return res.status(200).json({
            message: "Problem updated successfully",
            data: problem
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const handlerDeleteProblems = async (req, res) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ message: "Not authorized" });

        const { problemId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(problemId))
            return res.status(400).json({ message: "Invalid problemId" });

        const deleted = await Problems.findByIdAndDelete(problemId);
        if (!deleted)
            return res.status(404).json({ message: "Problem not found" });

        return res.status(200).json({ message: "Problem deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handlerGetListProblems = async (req, res) => {
    try {
        const { page = 1, limit = 20, difficulty, tag } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const filter = { hidden: { $ne: true } };
        if (difficulty) filter.difficulty = difficulty;
        if (tag) filter.tags = tag;

        const total = await Problems.countDocuments(filter);

        const problems = await Problems.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        // *** BẮT ĐẦU THAY ĐỔI ***
        const user = req.user || null;
        const userSaved = (user && Array.isArray(user.savedProblems)) ? user.savedProblems.map(String) : [];
        const userSolved = (user && Array.isArray(user.solvedProblems)) ? user.solvedProblems.map(String) : []; // Lấy danh sách ID bài đã giải

        const summaries = problems.map((p) => {
            const problemIdStr = String(p._id);
            return {
                id: p._id,
                title: p.title,
                difficulty: p.difficulty || 'Unknown',
                acceptance: (p.acceptance != null) ? p.acceptance : 0,
                solved: user ? userSolved.includes(problemIdStr) : false, // Kiểm tra xem bài này đã giải chưa
                saved: user ? userSaved.includes(problemIdStr) : false,
            };
        });
        // *** KẾT THÚC THAY ĐỔI ***

        return res.status(200).json({
            data: summaries,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handlerGetProblemById = async (req, res) => {
    try {
        const { problemId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(problemId)) {
            return res.status(400).json({ message: "Invalid Problem ID" });
        }

        const problem = await Problems.findById(problemId);

        if (!problem || problem.hidden === true) {
            return res.status(404).json({ message: "Problem not found" });
        }

        return res.status(200).json({ data: problem });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


//TODO tìm kiếm theo từ khóa
const handlerSearchProblems = async (req, res) => {

};

module.exports = { 
    handlerCreateProblems, 
    handlerUpdateProblems, 
    handlerDeleteProblems, 
    handlerGetListProblems, 
    handlerGetProblemById,
    handlerSearchProblems 
};
