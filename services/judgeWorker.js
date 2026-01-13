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

/**
 * A very simple function to run code in a Docker container.
 * It returns the stdout of the executed command.
 */
async function runInDocker(image, code, language, input) {
    const langConfig = getLanguageConfig(language);
    if (!langConfig) throw new Error(`Language ${language} not configured.`);

    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-step1-'));
    const sourceFilePath = path.join(tmpdir, langConfig.srcFileName);
    await fs.writeFile(sourceFilePath, code);

    // Command to execute inside Docker.
    // We use `echo` to pipe the input to the script.
    // The input is escaped to handle single quotes.
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
                reject(new Error(`Docker execution failed with code ${code}. Stderr: ${stderr}`));
            }
        });

        proc.on('error', (err) => {
            fs.rm(tmpdir, { recursive: true, force: true }).catch(err => console.error(`Failed to cleanup tmpdir: ${tmpdir}`, err));
            reject(err);
        });
    });
}

async function processSubmission(submissionId) {
    console.log(`[Step 1] Processing submission: ${submissionId}`);
    
    const submission = await Submissions.findById(submissionId);
    if (!submission) {
        console.error(`[Step 1] Submission ${submissionId} not found.`);
        return;
    }

    const problem = await Problems.findById(submission.problemId).lean();
    if (!problem || !problem.testcases || problem.testcases.length === 0) {
        console.error(`[Step 1] Problem or testcases not found for submission ${submissionId}.`);
        return;
    }

    const userCode = submission.code;
    const language = submission.language;
    const firstTestcase = problem.testcases[0];
    const langConfig = getLanguageConfig(language);

    console.log(`[Step 1] Language: ${language}, Image: ${langConfig.image}`);
    console.log(`[Step 1] Testcase Input:`, firstTestcase.input);

    try {
        const output = await runInDocker(langConfig.image, userCode, language, firstTestcase.input);
        
        console.log('-------------------------------------------');
        console.log('           CODE EXECUTION RESULT           ');
        console.log('-------------------------------------------');
        console.log(`Submission ID:   ${submissionId}`);
        console.log(`Expected Output:   ${firstTestcase.output}`);
        console.log(`Actual Output:     ${output.trim()}`);
        console.log('-------------------------------------------');

        // For now, we just mark it as 'Completed' to signify the worker has finished.
        await Submissions.findByIdAndUpdate(submissionId, { $set: { status: 'Completed' } });

    } catch (error) {
        console.error(`[Step 1] An error occurred while processing submission ${submissionId}:`, error);
        await Submissions.findByIdAndUpdate(submissionId, { $set: { status: 'Error' } });
    }
}

// --- Worker Lifecycle ---
let isStopping = false;

async function startWorker() {
    console.log('Judge worker (Step 1: Simple Execution) started. Waiting for submissions.');
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
