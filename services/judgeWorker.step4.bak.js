const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisWorkerClient } = require('../config/redis');
const { getLanguageConfig } = require('../config/languageConfig');

const SUBMISSION_QUEUE = 'submissionQueue';

/**
 * A generic utility to execute a command in a Docker container.
 * Returns a promise that resolves to { success, stdout, stderr, exitCode }.
 */
function executeCommand(image, commandConfig, tmpdir, containerDir, timeLimit = 30, input = null) {
    // For compilation, timeLimit is longer; for execution, it's controlled by the problem's time limit.
    const commandWithTimeout = {
        cmd: 'timeout',
        args: [`${timeLimit}s`, commandConfig.cmd, ...commandConfig.args]
    };
    
    const command = `${commandWithTimeout.cmd} ${commandWithTimeout.args.join(' ')}`;
    const fullShellCommand = input ? `echo -n '${input.replace(/'/g, `'\''`)}' | ${command}` : command;

    return new Promise((resolve) => {
        const dockerArgs = [
            'run', '--rm', '-i', '--network=none', '--cpus=1',
            '-v', `${tmpdir}:${containerDir}`,
            '-w', containerDir,
            image,
            'sh', '-c', fullShellCommand
        ];

        const proc = spawn('docker', dockerArgs);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (exitCode) => {
            resolve({ success: exitCode === 0, stdout, stderr, exitCode });
        });

        proc.on('error', (err) => {
            console.error("Spawn error:", err);
            resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1 });
        });
    });
}

async function updateSubmission(submissionId, updateData) {
    await Submissions.findByIdAndUpdate(submissionId, { $set: updateData });
}

// --- STEP 4: Refactored Submission Processing ---
async function processSubmission(submissionId) {
    const submission = await Submissions.findById(submissionId);
    if (!submission) {
        console.error(`[Step 4] Submission ${submissionId} not found.`);
        return;
    }

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem) {
        return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem not found.' } });
    }
    
    await updateSubmission(submissionId, { status: 'Running' });

    const langConfig = getLanguageConfig(submission.language);
    const problemTimeLimit = problem.timeLimit || 2;
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-step4-'));

    try {
        // Write source code to temp directory
        await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), submission.code);

        // 1. COMPILE ONCE (if needed)
        if (langConfig.compileCmd) {
            console.log(`[Step 4] Compiling source for ${submission.language}...`);
            // Use a longer, fixed timeout for compilation (e.g., 30s)
            const compileResult = await executeCommand(langConfig.image, langConfig.compileCmd, tmpdir, langConfig.containerDir, 30);
            
            if (!compileResult.success) {
                console.log(`[Step 4] Compilation Failed.`);
                return await updateSubmission(submissionId, {
                    status: 'Compilation Error',
                    result: { error: compileResult.stderr.slice(0, 1000) }
                });
            }
        }

        // 2. EXECUTE FOR EACH TESTCASE
        let passedCount = 0;
        for (let i = 0; i < problem.testcases.length; i++) {
            const tc = problem.testcases[i];
            console.log(`[Step 4] Running testcase ${i + 1}/${problem.testcases.length}...`);

            const runResult = await executeCommand(langConfig.image, langConfig.runCmd, tmpdir, langConfig.containerDir, problemTimeLimit, tc.input);

            if (runResult.exitCode === 124) { // TLE
                return await updateSubmission(submissionId, { status: 'Time Limit Exceeded' });
            }
            if (!runResult.success) { // Runtime Error
                return await updateSubmission(submissionId, {
                    status: 'Runtime Error',
                    result: { error: runResult.stderr.slice(0, 1000) }
                });
            }

            const trimmedOutput = runResult.stdout.trim();
            const expectedOutput = tc.output.trim();

            if (trimmedOutput !== expectedOutput) {
                return await updateSubmission(submissionId, {
                    status: 'Wrong Answer',
                    result: {
                        passedCount,
                        totalCount: problem.testcases.length,
                        failedTestcase: { input: tc.isHidden ? 'Hidden' : tc.input, expectedOutput: tc.isHidden ? 'Hidden' : expectedOutput, userOutput: trimmedOutput }
                    }
                });
            }
            passedCount++;
        }

        // All testcases passed
        await updateSubmission(submissionId, {
            status: 'Accepted',
            result: { passedCount, totalCount: problem.testcases.length }
        });

    } catch (error) {
        console.error(`[Step 4] An unexpected error occurred for submission ${submissionId}:`, error);
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'An unexpected judge error occurred.' } });
    } finally {
        // Cleanup the temp directory
        await fs.rm(tmpdir, { recursive: true, force: true });
    }
}


// --- Worker Lifecycle ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 4: Optimized - Compile Once) started. Waiting for submissions.');
    while (!isStopping) {
        try {
            const result = await redisWorkerClient.brPop(SUBMISSION_QUEUE, 0);
            if (result && !isStopping) {
                processSubmission(result.element).catch(err => {
                    console.error(`Unhandled exception in processSubmission for ${result.element}:`, err);
                });
            }
        } catch (err) {
            if (isStopping) break;
            console.error('Worker loop error:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.log('Judge worker stopped.');
}

function stopWorker() {
    if (!isStopping) {
        isStopping = true;
        if (redisWorkerClient.isOpen) {
            redisWorkerClient.disconnect().catch(err => console.error('Error disconnecting redis for worker shutdown', err));
        }
    }
}

process.on('SIGTERM', stopWorker);
process.on('SIGINT', stopWorker);

module.exports = { startWorker, stopWorker };
