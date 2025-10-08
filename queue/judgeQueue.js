const Queue = require('bull');
const { judge } = require('../workers/judgeWorker');

const judgeQueue = new Queue("judgeQueue", "redis://127.0.0.1:6379");

judgeQueue.process( async (job) => {
    await judge(job.data.submissionId);
});

module.exports = judgeQueue;
