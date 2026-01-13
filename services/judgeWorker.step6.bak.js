const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisWorkerClient } = require('../config/redis');
const { getLanguageConfig } = require('../config/languageConfig');

const SUBMISSION_QUEUE = 'submissionQueue';
const TEMPLATE_PLACEHOLDER = 'USER_CODE_PLACEHOLDER';

async function executeCommand(submissionId, image, commandConfig, tmpdir, containerDir, timeLimit, input = null, isRunCmd = false) {
    const containerName = `judge-${submissionId}-${Date.now()}`;
    const timeoutCmd = `timeout ${timeLimit}s ${commandConfig.cmd} ${commandConfig.args.join(' ')}`;
    const fullShellCommand = input ? `echo -n '${input.replace(/'/g, `'\''`)}' | ${timeoutCmd}` : timeoutCmd;

    const dockerArgs = [
        'run', '--rm', '-i', '--name', containerName, '--network=none', '--cpus=1', '-m', '256m', // Hard memory limit
        '-v', `${tmpdir}:${containerDir}`,
        '-w', containerDir,
        image,
        'sh', '-c', fullShellCommand
    ];

    const startTime = process.hrtime.bigint();
    let maxMemory = 0;
    let statsInterval;

    const dockerPromise = new Promise((resolve) => {
        const proc = spawn('docker', dockerArgs);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (exitCode) => {
            const endTime = process.hrtime.bigint();
            const runtime = Number((endTime - startTime) / 1000000n); // ms
            resolve({ success: exitCode === 0, stdout, stderr, exitCode, runtime, memory: maxMemory });
        });

        proc.on('error', (err) => {
            console.error("Spawn error:", err);
            resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1, runtime: 0, memory: 0 });
        });
    });

    if (isRunCmd) {
        statsInterval = setInterval(async () => {
            try {
                // --no-stream gets a single reading. --format gives us just the number.
                const { stdout } = await exec(`docker stats --no-stream --format "{{.MemUsage}}" ${containerName}`);
                const memUsage = parseFloat(stdout); // Comes in MiB
                if (!isNaN(memUsage)) {
                    maxMemory = Math.max(maxMemory, Math.round(memUsage * 1024)); // Convert MiB to KB
                }
            } catch (error) {
                // This can fail if the container finishes between checks. It's expected.
            }
        }, 100); // Poll every 100ms
    }

    const result = await dockerPromise;
    if (statsInterval) clearInterval(statsInterval);
    
    // Ensure the container is cleaned up, even if it hangs somehow.
    exec(`docker kill ${containerName}`).catch(() => {});

    return result;
}

async function updateSubmission(submissionId, updateData) {
    await Submissions.findByIdAndUpdate(submissionId, { $set: updateData });
}

async function processSubmission(submissionId) {
    const submission = await Submissions.findById(submissionId);
    if (!submission) return;

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem) return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem not found.' } });
    
    await updateSubmission(submissionId, { status: 'Running' });

    const langConfig = getLanguageConfig(submission.language);
    const problemTimeLimit = problem.timeLimit || 2;
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-final-'));

    try {
        let finalCode = submission.code;
        const codeTemplate = problem.codeTemplates?.find(t => t.language === submission.language);
        if (codeTemplate?.template) {
            finalCode = codeTemplate.template.replace(TEMPLATE_PLACEHOLDER, submission.code);
        }

        await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), finalCode);

        if (langConfig.compileCmd) {
            console.log(`[Step 6 FINAL] Compiling for ${submission.language}...`);
            const compileResult = await executeCommand(submissionId, langConfig.image, langConfig.compileCmd, tmpdir, langConfig.containerDir, 30, null, false); // No measurement for compile

            if (!compileResult.success) {
                return await updateSubmission(submissionId, { status: 'Compilation Error', result: { error: compileResult.stderr.slice(0, 1000) } });
            }
        }

        let maxRuntime = 0;
        let maxMemory = 0;
        let passedCount = 0;

        for (let i = 0; i < problem.testcases.length; i++) {
            const tc = problem.testcases[i];
            console.log(`[Step 6 FINAL] Running testcase ${i + 1}/${problem.testcases.length}...`);

            const runResult = await executeCommand(submissionId, langConfig.image, langConfig.runCmd, tmpdir, langConfig.containerDir, problemTimeLimit, tc.input, true);

            maxRuntime = Math.max(maxRuntime, runResult.runtime);
            maxMemory = Math.max(maxMemory, runResult.memory);

            if (runResult.exitCode === 124) {
                return await updateSubmission(submissionId, { status: 'Time Limit Exceeded', runtime: maxRuntime, memory: maxMemory });
            }
            if (!runResult.success) {
                return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: runResult.stderr.slice(0, 1000) }, runtime: maxRuntime, memory: maxMemory });
            }

            const trimmedOutput = runResult.stdout.trim();
            const expectedOutput = tc.output.trim();

            if (trimmedOutput !== expectedOutput) {
                return await updateSubmission(submissionId, {
                    status: 'Wrong Answer', runtime: maxRuntime, memory: maxMemory,
                    result: { passedCount, totalCount: problem.testcases.length, failedTestcase: { input: tc.isHidden ? 'Hidden' : tc.input, expectedOutput: tc.isHidden ? 'Hidden' : tc.input, userOutput: trimmedOutput }}
                });
            }
            passedCount++;
        }

        await updateSubmission(submissionId, { status: 'Accepted', runtime: maxRuntime, memory: maxMemory, result: { passedCount, totalCount: problem.testcases.length } });

    } catch (error) {
        console.error(`[Step 6 FINAL] Unexpected error for submission ${submissionId}:`, error);
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'An unexpected judge error occurred.' } });
    } finally {
        await fs.rm(tmpdir, { recursive: true, force: true });
    }
}

// --- Worker Lifecycle remains the same---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 6 FINAL: Docker Stats Arch) started.');
    while (!isStopping) {
        try {
            const result = await redisWorkerClient.brPop(SUBMISSION_QUEUE, 0);
            if (result && !isStopping) { process.nextTick(() => processSubmission(result.element)); }
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
        if (redisWorkerClient.isOpen) { redisWorkerClient.disconnect(); }
    }
}

process.on('SIGTERM', stopWorker);
process.on('SIGINT', stopWorker);

module.exports = { startWorker, stopWorker };
