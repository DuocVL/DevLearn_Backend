const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisWorkerClient } = require('../config/redis');
const { getLanguageConfig } = require('../config/languageConfig');

const SUBMISSION_QUEUE = 'submissionQueue';

// The runInDocker function remains the same as in Step 1.
async function runInDocker(image, code, language, input) {
    const langConfig = getLanguageConfig(language);
    if (!langConfig) throw new Error(`Language ${language} not configured.`);

    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-step2-'));
    const sourceFilePath = path.join(tmpdir, langConfig.srcFileName);
    await fs.writeFile(sourceFilePath, code);

    const command = `echo -n '${input.replace(/'/g, `'\''`)}' | ${langConfig.runCmd.cmd} ${langConfig.runCmd.args.join(' ')}`;

    return new Promise((resolve, reject) => {
        const dockerArgs = [
            'run', '--rm', '-i', '--network=none', '--cpus=1',
            '-v', `${tmpdir}:${langConfig.containerDir}`,
            '-w', langConfig.containerDir,
            image,
            'sh', '-c', command
        ];

        const proc = spawn('docker', dockerArgs);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            fs.rm(tmpdir, { recursive: true, force: true }).catch(err => console.error(`Failed to cleanup tmpdir: ${tmpdir}`, err));
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Execution failed with code ${code}. Stderr: ${stderr}`));
            }
        });

        proc.on('error', (err) => {
            fs.rm(tmpdir, { recursive: true, force: true }).catch(err => console.error(`Failed to cleanup tmpdir: ${tmpdir}`, err));
            reject(err);
        });
    });
}

// Helper to update submission status in the database.
async function updateSubmission(submissionId, updateData) {
    await Submissions.findByIdAndUpdate(submissionId, { $set: updateData });
}

async function processSubmission(submissionId) {
    console.log(`[Step 2] Processing submission: ${submissionId}`);
    let submission = await Submissions.findById(submissionId);
    if (!submission) {
        console.error(`[Step 2] Submission ${submissionId} not found.`);
        return;
    }

    await updateSubmission(submissionId, { status: 'Running' });

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem || !problem.testcases || problem.testcases.length === 0) {
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem or testcases not found.' } });
        return;
    }

    const langConfig = getLanguageConfig(submission.language);
    const testcases = problem.testcases;
    let passedCount = 0;

    for (let i = 0; i < testcases.length; i++) {
        const tc = testcases[i];
        console.log(`[Step 2] Running testcase ${i + 1}/${testcases.length}...`);
        
        await updateSubmission(submissionId, { 
            result: { passedCount: passedCount, totalCount: testcases.length }
        });

        try {
            const actualOutput = await runInDocker(langConfig.image, submission.code, submission.language, tc.input);
            const trimmedOutput = actualOutput.trim();
            const expectedOutput = tc.output.trim();

            if (trimmedOutput !== expectedOutput) {
                console.log(`[Step 2] Wrong Answer on testcase ${i + 1}.`);
                await updateSubmission(submissionId, {
                    status: 'Wrong Answer',
                    result: {
                        passedCount,
                        totalCount: testcases.length,
                        failedTestcase: {
                            input: tc.isHidden ? 'Hidden' : tc.input,
                            expectedOutput: tc.isHidden ? 'Hidden' : expectedOutput,
                            userOutput: trimmedOutput,
                        }
                    }
                });
                return; // Stop processing
            }

            passedCount++;

        } catch (error) {
            console.error(`[Step 2] Runtime Error on testcase ${i + 1}:`, error.message);
            await updateSubmission(submissionId, {
                status: 'Runtime Error',
                result: {
                    passedCount,
                    totalCount: testcases.length,
                    error: error.message
                }
            });
            return; // Stop processing
        }
    }

    console.log(`[Step 2] All ${testcases.length} testcases passed! Submission Accepted.`);
    await updateSubmission(submissionId, {
        status: 'Accepted',
        result: {
            passedCount,
            totalCount: testcases.length
        }
    });
}

// --- Worker Lifecycle (Updated log message) ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 2: Full Judging Logic) started. Waiting for submissions.');
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
