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
// CORRECTED: The placeholder is now language-agnostic.
const TEMPLATE_PLACEHOLDER = 'USER_CODE_PLACEHOLDER';

// executeCommand function remains the same as Step 4.
function executeCommand(image, commandConfig, tmpdir, containerDir, timeLimit = 30, input = null) {
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

// --- STEP 5 (FIXED): Function-Based Problem Support ---
async function processSubmission(submissionId) {
    const submission = await Submissions.findById(submissionId);
    if (!submission) {
        console.error(`[Step 5 FIX] Submission ${submissionId} not found.`);
        return;
    }

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem) {
        return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem not found.' } });
    }
    
    await updateSubmission(submissionId, { status: 'Running' });

    const langConfig = getLanguageConfig(submission.language);
    const problemTimeLimit = problem.timeLimit || 2;
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-step5-fix-'));

    try {
        let finalCode = submission.code;
        const codeTemplate = problem.codeTemplates?.find(t => t.language === submission.language);

        if (codeTemplate && codeTemplate.template) {
            console.log(`[Step 5 FIX] Found code template for ${submission.language}. Assembling final code.`);
            finalCode = codeTemplate.template.replace(TEMPLATE_PLACEHOLDER, submission.code);
        } else {
            console.log(`[Step 5 FIX] No code template found. Running as a complete program.`);
        }

        await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), finalCode);

        if (langConfig.compileCmd) {
            console.log(`[Step 5 FIX] Compiling source for ${submission.language}...`);
            const compileResult = await executeCommand(langConfig.image, langConfig.compileCmd, tmpdir, langConfig.containerDir, 30);
            
            if (!compileResult.success) {
                return await updateSubmission(submissionId, {
                    status: 'Compilation Error',
                    result: { error: compileResult.stderr.slice(0, 1000) }
                });
            }
        }

        let passedCount = 0;
        for (let i = 0; i < problem.testcases.length; i++) {
            const tc = problem.testcases[i];
            console.log(`[Step 5 FIX] Running testcase ${i + 1}/${problem.testcases.length}...`);

            const runResult = await executeCommand(langConfig.image, langConfig.runCmd, tmpdir, langConfig.containerDir, problemTimeLimit, tc.input);

            if (runResult.exitCode === 124) { // TLE
                return await updateSubmission(submissionId, { status: 'Time Limit Exceeded' });
            }
            if (!runResult.success) { // Runtime Error
                return await updateSubmission(submissionId, {
                    status: 'Runtime Error',                    result: { error: runResult.stderr.slice(0, 1000) }
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

        await updateSubmission(submissionId, {
            status: 'Accepted',
            result: { passedCount, totalCount: problem.testcases.length }
        });

    } catch (error) {
        console.error(`[Step 5 FIX] An unexpected error occurred for submission ${submissionId}:`, error);
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'An unexpected judge error occurred.' } });
    } finally {
        await fs.rm(tmpdir, { recursive: true, force: true });
    }
}

// --- Worker Lifecycle ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 5 FIX: Standardized Placeholder) started. Waiting for submissions.');
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
