const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const redisClient = require('../config/redis'); // Import the Redis client

const SUBMISSION_QUEUE = 'submissionQueue'; // Name of our Redis queue

// Create a new submission (enqueue)
const createSubmission = async (req, res) => {
  try {
    const { problemId, language, code } = req.body;
    if (!problemId || !language || !code) return res.status(400).json({ message: 'Missing required fields' });

    // OPTIMIZATION: Use countDocuments for a much faster existence check.
    // This is the key change to prevent timeouts.
    const problemExists = await Problems.countDocuments({ _id: problemId });
    if (problemExists === 0) return res.status(404).json({ message: 'Problem not found' });

    const submission = await Submissions.create({
      problemId,
      userId: req.user._id,
      language,
      code,
      status: 'Pending' // Status is now 'Pending'
    });

    // Push the submission ID to the Redis queue
    await redisClient.lPush(SUBMISSION_QUEUE, String(submission._id));

    // This response should now be sent quickly, before any timeout occurs.
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

module.exports = { createSubmission, getSubmission };
