const mongoose = require('mongoose');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const judgeQueue = require('../queue/judgeQueue');

const handlerCreateSubmisson = async (req, res) =>{
    try {
        const { problemId , language, code } = req.body;
        if(!problemId || !language || !code ) return res.status(400).json({ message: "Missing required fields" });

        if(!mongoose.Types.ObjectId.isValid(problemId)) return res.status(400).json({ message: "Invalid problemId" });
        
        const problem = Problems.findById(problemId);
        if(!problem) return res.status(404).json({ message: "Problem not found" });

        const submission = await Submissions.create({
            problemId,
            language,
            code,
        });

        await judgeQueue.add({ submissionId: submission._id });

        return res.status(201).json({ message: "Submission created successfully", data: submission });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const handlerGetSubmisson = async (req, res) => {
    try {
        const { submissionId } = req.params;
        if(!submissionId) return res.status(400).json({ message: "Missing required fields" });

        if(!mongoose.Types.ObjectId(submissionId)) return res.status(400).json({ message: "Invalid submissionId" });

        const submission = await Submissions.findById(submissionId);
        if(!submission) return res.status(404).json({ message: "Submission not found" });

        return res.status(200).json({ data: submission });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

const handlerGetListSubmisson = async (req, res) => {

};

module.exports = { handlerCreateSubmisson, handlerGetSubmisson, handlerGetListSubmisson };