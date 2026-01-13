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
 * Manages the entire Docker-based code execution process, including compilation and running.
 * @returns {object} An object containing the final result: { status, stdout, stderr, executionTime }
 */
async function runInDocker(image, code, language, input, timeLimit) {
    const langConfig = getLanguageConfig(language);
    if (!langConfig) throw new Error(`Language ${language} not configured.`);

    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-step3-'));
    const sourceFilePath = path.join(tmpdir, langConfig.srcFileName);
    await fs.writeFile(sourceFilePath, code);

    let compileResult = { success: true, stderr: '' };

    // 1. Compilation Step (if necessary)
    if (langConfig.compileCmd) {
        console.log(`[Step 3] Compiling source for ${language}...`);
        compileResult = await executeCommand(image, langConfig.compileCmd, tmpdir, langConfig.containerDir);
        if (!compileResult.success) {
            await fs.rm(tmpdir, { recursive: true, force: true });
            return { status: 'Compilation Error', stdout: '', stderr: compileResult.stderr };
        }
    }

    // 2. Execution Step (with timeout)
    const runCommandWithTimeout = {
        cmd: 'timeout',
        args: [`${timeLimit}s`, langConfig.runCmd.cmd, ...langConfig.runCmd.args]
    };

    const runResult = await executeCommand(image, runCommandWithTimeout, tmpdir, langConfig.containerDir, input);

    // 3. Cleanup
    await fs.rm(tmpdir, { recursive: true, force: true });

    // 4. Determine final status
    if (!runResult.success) {
        if (runResult.exitCode === 124) { // `timeout` command exit code for TLE
            return { status: 'Time Limit Exceeded', stdout: '', stderr: '' };
        }
        return { status: 'Runtime Error', stdout: '', stderr: runResult.stderr };
    }
    
    return { status: 'Success', stdout: runResult.stdout, stderr: runResult.stderr };
}

/**
 * A generic utility to execute a command in a Docker container.
 * @returns {object} { success: boolean, stdout: string, stderr: string, exitCode: number }
 */
function executeCommand(image, commandConfig, tmpdir, containerDir, input = null) {
    const command = `${commandConfig.cmd} ${commandConfig.args.join(' ')}`;
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

async function processSubmission(submissionId) {
    console.log(`[Step 3] Processing submission: ${submissionId}`);
    const submission = await Submissions.findById(submissionId);
    if (!submission) {
        console.error(`[Step 3] Submission ${submissionId} not found.`);
        return;
    }

    await updateSubmission(submissionId, { status: 'Running' });

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem) {
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem not found.' } });
        return;
    }

    const langConfig = getLanguageConfig(submission.language);
    const timeLimit = problem.timeLimit || 2; // Use problem's time limit, fallback to 2s

    // Run all testcases
    let passedCount = 0;
    for (let i = 0; i < problem.testcases.length; i++) {
        const tc = problem.testcases[i];
        console.log(`[Step 3] Running testcase ${i + 1}/${problem.testcases.length}...`);

        const executionResult = await runInDocker(langConfig.image, submission.code, submission.language, tc.input, timeLimit);

        if (executionResult.status !== 'Success') {
             await updateSubmission(submissionId, {
                status: executionResult.status,
                result: { error: executionResult.stderr.slice(0, 1000) } // Truncate long error messages
            });
            return; // Stop on first failure (CE, TLE, RE)
        }

        const trimmedOutput = executionResult.stdout.trim();
        const expectedOutput = tc.output.trim();

        if (trimmedOutput !== expectedOutput) {
            console.log(`[Step 3] Wrong Answer on testcase ${i + 1}.`);
            await updateSubmission(submissionId, {
                status: 'Wrong Answer',
                result: {
                    passedCount,
                    totalCount: problem.testcases.length,
                    failedTestcase: {
                        input: tc.isHidden ? 'Hidden' : tc.input,
                        expectedOutput: tc.isHidden ? 'Hidden' : expectedOutput,
                        userOutput: trimmedOutput,
                    }
                }
            });
            return;
        }
        passedCount++;
    }

    console.log(`[Step 3] All ${problem.testcases.length} testcases passed! Submission Accepted.`);
    await updateSubmission(submissionId, {
        status: 'Accepted',
        result: { passedCount, totalCount: problem.testcases.length }
    });
}

// --- Worker Lifecycle ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 3: Full Logic + TLE/CE) started. Waiting for submissions.');
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
