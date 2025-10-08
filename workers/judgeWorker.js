const { runCode } = require('../utils/languageRunner');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');

async function judge(submissionId) {
    const submission = await Submissions.findById(submissionId);
    if (!submission) return console.error("Submission not found");

    const problem = await Problems.findById(submission.problemId);
    if (!problem) return console.error("Problem not found");

     // Cập nhật trạng thái sang đang chạy
    submission.status = "Running";
    await submission.save();

    let passedCount = 0;
    const totalCount = problem.testcases.length;
    let failedTestcase = null;
    let totalRuntime = 0;
    let totalMemory = 0;

    for(const tc of problem.testcases){
        try {
            const { userOut , runtime, memory} = await runCode(
                submission.language,
                submission.code,
                tc.input,
            );
            const correct = userOut.trim() === tc.output.trim();
            if (correct) {
                passedCount++;
            } else {
                failedTestcase = {
                    input: tc.input,
                    expectedOutput: tc.output,
                    userOutput: userOut,
                };
                submission.status = "Wrong Answer";
                break;
            }

            totalRuntime += runtime;
            totalMemory += memory || 0;
        } catch (err) {
            failedTestcase = {
                input: tc.input,
                expectedOutput: tc.output,
                userOutput: "Runtime Error",
            };
            submission.status = "Runtime Error";
            break;
        }
    }

    if (passedCount === totalCount) submission.status = "Accepted";

    submission.result = {
        passedCount,
        totalCount,
        failedTestcases: failedTestcase,
    };
    submission.runtime = totalRuntime;
    submission.memory = totalMemory; // trung bình hoặc max tùy bạn
    await submission.save();

    console.log(`✅ Judged submission ${submission._id}: ${submission.status}`);

};

module.exports = { judge };