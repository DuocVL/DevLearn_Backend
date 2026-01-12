const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisClient } = require('../config/redis'); // Correctly import the client
const socketService = require('./socketService');

const SUBMISSION_QUEUE = 'submissionQueue';
const DEFAULT_TIMEOUT_MS = 3000;

// (The rest of the file remains the same...)

// Helper to update submission and notify clients
async function updateSubmissionStatus(submissionId, userId, updateData) {
    const submission = await Submissions.findByIdAndUpdate(submissionId, updateData, { new: true });
    if (submission) {
        // The event that the client will listen for
        const eventType = 'submission_update'; 
        console.log(`Notifying user ${userId} about ${eventType}`);
        socketService.sendToUser(userId, { 
            type: eventType,
            payload: submission.toObject() // Send the full updated submission object
        });
    }
    return submission;
}


async function runCommand(image, hostDir, command, args, options = {}, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const containerDir = '/usr/src/app';
    const resolvedHostDir = path.resolve(hostDir);
    const dockerArgs = [
      'run', '--rm', '--network=none', '--memory=256m', '--cpus=1',
      '-v', `${resolvedHostDir}:${containerDir}`,
      '-w', containerDir, image, command, ...args
    ];

    const proc = spawn('docker', dockerArgs, options);
    let stdout = '', stderr = '', timedOut = false;

    const to = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (e) {}
    }, timeout);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code, signal) => {
      clearTimeout(to);
      resolve({ code, signal, stdout, stderr, timedOut });
    });

    if (input) {
        try { proc.stdin.write(input); proc.stdin.end(); } catch (e) {}
    } else {
        try { proc.stdin.end(); } catch(e) {}
    }
  });
}

async function processSubmission(submissionId) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    console.error(`Invalid submissionId: ${submissionId}`);
    return;
  }

  let sub = await Submissions.findById(submissionId);
  if (!sub) {
    console.error(`Submission ${submissionId} not found.`);
    return;
  }
  const userId = sub.userId;

  // Mark as 'Running' and notify
  sub = await updateSubmissionStatus(sub._id, userId, { status: 'Running' });

  const problem = await Problems.findById(sub.problemId).lean();
  const testcases = problem?.testcases || [];
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));

  try {
    let image, compileCmd, runCmd, srcFileName;
    
    switch (sub.language) {
        case 'python':
          image = 'python:3.9-slim';
          srcFileName = 'main.py';
          runCmd = { cmd: 'python3', args: ['main.py'] };
          break;
        case 'javascript':
          image = 'node:18-slim';
          srcFileName = 'main.js';
          runCmd = { cmd: 'node', args: ['main.js'] };
          break;
        case 'cpp':
          image = 'gcc:11';
          srcFileName = 'main.cpp';
          compileCmd = { cmd: 'g++', args: ['-O2', '-std=c++17', 'main.cpp', '-o', 'a.out'] };
          runCmd = { cmd: './a.out', args: [] };
          break;
        default:
          await updateSubmissionStatus(sub._id, userId, { status: 'Runtime Error', result: { error: `Language ${sub.language} not supported.` } });
          return;
      }

    fs.writeFileSync(path.join(tmpdir, srcFileName), sub.code);

    if (compileCmd) {
      const comp = await runCommand(image, tmpdir, compileCmd.cmd, compileCmd.args, {}, '', 10000);
      if (comp.code !== 0 || comp.timedOut) {
        await updateSubmissionStatus(sub._id, userId, { status: 'Compilation Error', result: { error: comp.stderr || comp.stdout } });
        return;
      }
    }

    let passed = 0, firstFail = null, totalTime = 0;
    for (let i = 0; i < testcases.length; i++) {
        const t = testcases[i];
        // Notify progress before running each test case
        await updateSubmissionStatus(sub._id, userId, { status: 'Running', result: { passedCount: passed, totalCount: testcases.length } });

        const input = t.input || '';
        const expected = (t.output || '').toString().trim();
        const startTime = Date.now();
        const res = await runCommand(image, tmpdir, runCmd.cmd, runCmd.args, {}, input, DEFAULT_TIMEOUT_MS);
        totalTime += (Date.now() - startTime);

        if (res.timedOut) {
            await updateSubmissionStatus(sub._id, userId, { status: 'Time Limit Exceeded', runtime: totalTime, result: { passedCount: passed, totalCount: testcases.length } });
            return;
        }
        if (res.code !== 0) {
            await updateSubmissionStatus(sub._id, userId, { status: 'Runtime Error', runtime: totalTime, result: { passedCount: passed, totalCount: testcases.length, error: res.stderr } });
            return;
        }

        const out = (res.stdout || '').toString().trim();
        if (out === expected) {
            passed++;
        } else {
            firstFail = { input: t.input, expectedOutput: expected, userOutput: out };
            break;
        }
    }

    const status = (passed === testcases.length) ? 'Accepted' : 'Wrong Answer';
    const finalResult = { passedCount: passed, totalCount: testcases.length };
    if (firstFail) finalResult.failedTestcases = firstFail;
    await updateSubmissionStatus(sub._id, userId, { status, result: finalResult, runtime: totalTime });

    if (status === 'Accepted') {
        await Problems.findByIdAndUpdate(sub.problemId, { $inc: { acceptedSubmissions: 1, totalSubmissions: 1 } });
    } else {
        await Problems.findByIdAndUpdate(sub.problemId, { $inc: { totalSubmissions: 1 } });
    }

  } catch (err) {
    console.error(`Error processing submission ${submissionId}:`, err);
    try {
      await updateSubmissionStatus(submissionId, userId, { status: 'Runtime Error', result: { error: 'An internal error occurred in the judge.' } });
    } catch (updateErr) {
      console.error(`Failed to update submission status to error for ID ${submissionId}:`, updateErr);
    }
  } finally {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) {}
  }
}

let _stopping = false;

async function startWorker() {
  console.log('Judge worker starting... Waiting for submissions.');
  while (!_stopping) {
    try {
      // Use a blocking pop with a timeout to allow for graceful shutdown.
      const result = await redisClient.brPop(SUBMISSION_QUEUE, 0);
      if (result) {
        const submissionId = result.element;
        console.log(`Processing submission: ${submissionId}`);
        await processSubmission(submissionId);
      }
    } catch (err) {
       if (err.message.includes('Connection is closed')) {
                console.log('Redis connection closed, stopping worker.');
                break; // Exit the loop if Redis connection is closed
            }
      console.error('Worker loop error:', err);
      if (!_stopping) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  console.log('Judge worker stopping.');
}

function stopWorker() {
  _stopping = true;
}

module.exports = { startWorker, stopWorker };
