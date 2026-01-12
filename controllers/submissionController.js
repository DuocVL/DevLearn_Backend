const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisClient } = require('../config/redis');

const SUBMISSION_QUEUE = 'submissionQueue';

const createSubmission = async (req, res) => {
  try {
    const { problemId, language, code } = req.body;
    if (!problemId || !language || !code) return res.status(400).json({ message: 'Missing required fields' });

    const problemExists = await Problems.countDocuments({ _id: problemId });
    if (problemExists === 0) return res.status(404).json({ message: 'Problem not found' });

    const submission = await Submissions.create({
      problemId,
      userId: req.user._id,
      language,
      code,
      status: 'Pending'
    });

    await redisClient.lPush(SUBMISSION_QUEUE, String(submission._id));

    return res.status(201).json({ message: 'Submission queued successfully', submissionId: submission._id });
  } catch (err) {
    console.error('createSubmission error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const getSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await Submissions.findById(id).lean();
    if (!sub) return res.status(404).json({ message: 'Submission not found' });

    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (String(sub.userId) !== String(req.user._id) && req.user.roles !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    return res.json({ submission: sub });
  } catch (err) {
    console.error('getSubmission error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// NEW: Get a list of submissions
const getSubmissions = async (req, res) => {
  try {
    const { problemId } = req.query;
    const filter = {};

    if (problemId) {
      filter.problemId = problemId;
    }

    // Regular users can only see their own submissions.
    // Admins can see all submissions for the given filter.
    if (req.user.roles !== 'admin') {
      filter.userId = req.user._id;
    }

    const submissions = await Submissions.find(filter)
      .sort({ createdAt: -1 }) // Sort by most recent first
      .lean();

    return res.json({ submissions });
  } catch (err) {
    console.error('getSubmissions error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { createSubmission, getSubmission, getSubmissions };
