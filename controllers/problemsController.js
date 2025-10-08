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
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { hidden: false };
        if(difficulty) filter.difficulty = difficulty;
        if(tag) filter.tags = { $inc: [tag] };

        const total = await Problems.countDocuments(filter);

        const problems = await Problems.find(filter)
            .sort({ createdAt: -1 }) 
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(200).json({
            data: problems,
             pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalComments: total
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};


//TODO tìm kiếm theo từ khóa
const handlerSearchProblems = async (req, res) => {

};

module.exports = { handlerCreateProblems, handlerUpdateProblems, handlerDeleteProblems, handlerGetListProblems, handlerSearchProblems };
