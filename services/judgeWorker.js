const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');
const { redisWorkerClient } = require('../config/redis'); // FIX: Use the dedicated worker client
const { getLanguageConfig } = require('../config/languageConfig');
const socketService = require('./socketService');

const SUBMISSION_QUEUE = 'submissionQueue';
const COMPILE_TIMEOUT_MS = 10000;
const EXECUTE_TIMEOUT_MS = 3000;

async function updateSubmission(submissionId, userId, updateData) {
    const submission = await Submissions.findByIdAndUpdate(submissionId, { $set: updateData }, { new: true });
    if (submission) {
        const eventType = 'submission_update';
        console.log(`Notifying user ${userId} about ${eventType}: ${submission.status}`);
        socketService.sendToUser(userId.toString(), { 
            type: eventType,
            payload: submission.toObject()
        });
    }
    return submission;
}

async function runInDocker(image, hostDir, command, args, input = '', timeout = EXECUTE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const containerDir = '/usr/src/app';
    const resolvedHostDir = path.resolve(hostDir);
    const dockerArgs = [
      'run', '-i', '--rm', '--network=none', '--memory=256m', '--cpus=1',
      '-v', `${resolvedHostDir}:${containerDir}`,
      '-w', containerDir, image, command, ...args
    ];

    const proc = spawn('docker', dockerArgs);
    let stdout = '', stderr = '', timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    }, timeout);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
    
    proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: 1, signal: null, stdout: '', stderr: err.message, timedOut: false, internalError: true });
    });

    try {
        proc.stdin.write(input);
        proc.stdin.end();
    } catch (e) { /* Stdin may be closed */ }
  });
}

async function processSubmission(submissionId) {
  // (logic inside this function remains the same)
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
  await updateSubmission(sub._id, userId, { status: 'Running', result: { passedCount: 0, totalCount: 0 } });

  const [problem, langConfig] = await Promise.all([
      Problems.findById(sub.problemId).lean(),
      getLanguageConfig(sub.language)
  ]);

  if (!langConfig) {
    await updateSubmission(sub._id, userId, { status: 'Runtime Error', result: { error: `Language ${sub.language} not supported.` } });
    return;
  }

  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));

  try {
    fs.writeFileSync(path.join(tmpdir, langConfig.srcFileName), sub.code);

    if (langConfig.compileCmd) {
      await updateSubmission(sub._id, userId, { status: 'Compiling' });
      const comp = await runInDocker(langConfig.image, tmpdir, langConfig.compileCmd.cmd, langConfig.compileCmd.args, '', COMPILE_TIMEOUT_MS);
      if (comp.code !== 0 || comp.timedOut) {
        await updateSubmission(sub._id, userId, { status: 'Compilation Error', result: { error: comp.stderr || comp.stdout || 'Compilation Timed Out' } });
        return;
      }
    }

    const testcases = problem?.testcases || [];
    let passed = 0, totalTime = 0, firstFail = null;

    for (let i = 0; i < testcases.length; i++) {
      const t = testcases[i];
      await updateSubmission(sub._id, userId, { status: 'Running', result: { passedCount: passed, totalCount: testcases.length } });

      const input = t.input || '';
      const startTime = Date.now();
      const res = await runInDocker(langConfig.image, tmpdir, langConfig.runCmd.cmd, langConfig.runCmd.args, input, EXECUTE_TIMEOUT_MS);
      totalTime += (Date.now() - startTime);

      if (res.timedOut) {
        await updateSubmission(sub._id, userId, { status: 'Time Limit Exceeded', runtime: totalTime, result: { passedCount: passed, totalCount: testcases.length } });
        return;
      }
      if (res.code === 137) {
        await updateSubmission(sub._id, userId, { status: 'Memory Limit Exceeded', runtime: totalTime, result: { passedCount: passed, totalCount: testcases.length } });
        return;
      }
      if (res.code !== 0) {
        await updateSubmission(sub._id, userId, { status: 'Runtime Error', runtime: totalTime, result: { passedCount: passed, totalCount: testcases.length, error: res.stderr } });
        return;
      }

      const expected = (t.output || '').toString().trim();
      const actual = (res.stdout || '').toString().trim();
      
      if (actual === expected) {
        passed++;
      } else {
        firstFail = { 
            input: t.isHidden ? 'Hidden Test Case' : t.input, 
            expectedOutput: t.isHidden ? 'Hidden Test Case' : expected, 
            userOutput: actual 
        };
        break;
      }
    }

    const status = (passed === testcases.length) ? 'Accepted' : 'Wrong Answer';
    const finalResult = { passedCount: passed, totalCount: testcases.length };
    if (firstFail) finalResult.failedTestcases = firstFail;

    await updateSubmission(sub._id, userId, { status, result: finalResult, runtime: totalTime });

    if (status === 'Accepted') {
      await Problems.findByIdAndUpdate(sub.problemId, { $inc: { acceptedSubmissions: 1, totalSubmissions: 1 } });
    } else {
      await Problems.findByIdAndUpdate(sub.problemId, { $inc: { totalSubmissions: 1 } });
    }

  } catch (err) {
    console.error(`Critical error processing submission ${submissionId}:`, err);
    try {
      await updateSubmission(submissionId, userId, { status: 'Runtime Error', result: { error: 'An internal judge error occurred.' } });
    } catch (updateErr) {
      console.error(`Failed to update submission status after critical error for ID ${submissionId}:`, updateErr);
    }
  } finally {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

let isStopping = false;

async function startWorker() {
  console.log('Judge worker started. Waiting for submissions.');
  while (!isStopping) {
    try {
      // FIX: Use the worker client for blocking pop
      const result = await redisWorkerClient.brPop(SUBMISSION_QUEUE, 0);
      if (result && !isStopping) {
        const submissionId = result.element;
        console.log(`Processing submission: ${submissionId}`);
        processSubmission(submissionId).catch(err => {
            console.error(`Unhandled exception in processSubmission for ${submissionId}:`, err);
        });
      }
    } catch (err) {
      if (isStopping || err.message.includes('Connection is closed')) {
        console.log('Redis connection closed, stopping worker loop.');
        break;
      }
      console.error('Worker loop error:', err);
      if (!isStopping) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  console.log('Judge worker stopped.');
}

function stopWorker() {
  if (!isStopping) {
    console.log('Stopping judge worker...');
    isStopping = true;
    // FIX: Disconnect the correct worker client
    redisWorkerClient.disconnect().catch(err => console.error('Error disconnecting redis for worker shutdown', err));
  }
}

process.on('SIGTERM', stopWorker);
process.on('SIGINT', stopWorker);

module.exports = { startWorker, stopWorker };
