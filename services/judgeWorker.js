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
const TEMPLATE_PLACEHOLDER = 'USER_CODE_PLACEHOLDER';

/**
 * Executes a command in a Docker container, with optional resource measurement via GNU time.
 * @returns {Promise<object>} { success, stdout, stderr, exitCode, runtime, memory }
 */
async function executeCommand(image, commandConfig, tmpdir, containerDir, timeLimit, input = null, measureResources = false) {
    // 1. Define the core user command
    const userCommand = `${commandConfig.cmd} ${commandConfig.args.join(' ')}`;

    // 2. Wrap the user command with timeout. This is the process we want to measure.
    const userCommandWithTimeout = `timeout ${timeLimit}s ${userCommand}`;

    // 3. Conditionally wrap the whole thing with the `time` utility for measurement.
    // `time` will measure `timeout`, which is correct. If `timeout` kills the user code,
    // `time` still reports how long `timeout` was running.
    let commandToExecute = userCommandWithTimeout;
    if (measureResources) {
        // Using /usr/bin/time to be explicit. The format string MUST be single-quoted for the shell.
        commandToExecute = `/usr/bin/time -f '%e;%M' ${userCommandWithTimeout}`;
    }

    // 4. Construct the full shell command for docker, with input piping if necessary.
    const fullShellCommand = input ? `echo -n '${input.replace(/'/g, `'\''`)}' | ${commandToExecute}` : commandToExecute;

    return new Promise((resolve) => {
        const dockerArgs = [
            'run', '--rm', '-i', '--network=none', '--cpus=1', '-m', '256m', // Hard memory limit
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
            let runtime = 0;
            let memory = 0;
            let finalStderr = stderr;

            // Exit code 124 means `timeout` killed the process.
            // We still want to parse the metrics in this case.
            if (measureResources) {
                try {
                    const resourceUsage = stderr.split('\n').pop()?.trim() || '';
                    const [timeStr, memStr] = resourceUsage.split(';');
                    const timeInSeconds = parseFloat(timeStr);
                    const memInKb = parseInt(memStr, 10);

                    if (!isNaN(timeInSeconds) && !isNaN(memInKb)) {
                        runtime = Math.round(timeInSeconds * 1000); // seconds to ms
                        memory = memInKb;
                        // Clean the stderr to remove the time measurement line for user-facing errors.
                        const lastNewline = stderr.lastIndexOf('\n');
                        finalStderr = lastNewline > -1 ? stderr.substring(0, lastNewline).trim() : '';
                    }
                } catch (e) {
                    // Parsing failed, which means the time command didn't output as expected.
                    // Leave resources as 0, but keep the original stderr for debugging.
                }
            }
            
            // For TLE, the success status is false
            const success = exitCode === 0;
            if (exitCode === 124) {
                 // Override the success status for TLE, but keep the parsed metrics.
                 return resolve({ success: false, stdout, stderr: 'Time Limit Exceeded', exitCode, runtime, memory });
            }

            resolve({ success, stdout, stderr: finalStderr, exitCode, runtime, memory });
        });

        proc.on('error', (err) => {
            console.error("Spawn error:", err);
            resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1, runtime: 0, memory: 0 });
        });
    });
}

async function updateSubmission(submissionId, updateData) {
    await Submissions.findByIdAndUpdate(submissionId, { $set: updateData });
}

// --- NEW ARCHITECTURE: Custom Docker Env ---
async function processSubmission(submissionId) {
    const submission = await Submissions.findById(submissionId);
    if (!submission) return;

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem) return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'Problem not found.' } });
    
    await updateSubmission(submissionId, { status: 'Running' });

    const langConfig = getLanguageConfig(submission.language);
    const problemTimeLimit = problem.timeLimit || 2;
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-new-arch-'));

    try {
        let finalCode = submission.code;
        const codeTemplate = problem.codeTemplates?.find(t => t.language === submission.language);
        if (codeTemplate?.template) {
            finalCode = codeTemplate.template.replace(TEMPLATE_PLACEHOLDER, submission.code);
        }

        await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), finalCode);

        if (langConfig.compileCmd) {
            console.log(`[New Arch] Compiling for ${submission.language}...`);
            const compileResult = await executeCommand(langConfig.image, langConfig.compileCmd, tmpdir, langConfig.containerDir, 30, null, false);

            if (!compileResult.success) {
                return await updateSubmission(submissionId, { status: 'Compilation Error', result: { error: compileResult.stderr.slice(0, 1000) } });
            }
        }

        let maxRuntime = 0;
        let maxMemory = 0;
        let passedCount = 0;

        for (let i = 0; i < problem.testcases.length; i++) {
            const tc = problem.testcases[i];
            console.log(`[New Arch] Running testcase ${i + 1}/${problem.testcases.length}...`);

            const runResult = await executeCommand(langConfig.image, langConfig.runCmd, tmpdir, langConfig.containerDir, problemTimeLimit, tc.input, true);

            maxRuntime = Math.max(maxRuntime, runResult.runtime);
            maxMemory = Math.max(maxMemory, runResult.memory);

            if (!runResult.success) {
                 if (runResult.exitCode === 124) {
                    return await updateSubmission(submissionId, { status: 'Time Limit Exceeded', runtime: maxRuntime, memory: maxMemory });
                 }
                return await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: runResult.stderr.slice(0, 1000) }, runtime: maxRuntime, memory: maxMemory });
            }

            const trimmedOutput = runResult.stdout.trim();
            const expectedOutput = tc.output.trim();

            if (trimmedOutput !== expectedOutput) {
                return await updateSubmission(submissionId, {
                    status: 'Wrong Answer', runtime: maxRuntime, memory: maxMemory,
                    result: { passedCount, totalCount: problem.testcases.length, failedTestcase: { input: tc.isHidden ? 'Hidden' : tc.input, expectedOutput: tc.isHidden ? 'Hidden' : tc.output, userOutput: trimmedOutput }}
                });
            }
            passedCount++;
        }

        await updateSubmission(submissionId, { status: 'Accepted', runtime: maxRuntime, memory: maxMemory, result: { passedCount, totalCount: problem.testcases.length } });

    } catch (error) {
        console.error(`[New Arch] Unexpected error for submission ${submissionId}:`, error);
        await updateSubmission(submissionId, { status: 'Runtime Error', result: { error: 'An unexpected judge error occurred.' } });
    } finally {
        await fs.rm(tmpdir, { recursive: true, force: true });
    }
}

// --- Worker Lifecycle ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (New Architecture: Custom Env) started.');
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
