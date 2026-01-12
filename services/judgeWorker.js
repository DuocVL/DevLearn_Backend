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
const socketService = require('./socketService');

const SUBMISSION_QUEUE = 'submissionQueue';
const COMPILE_TIMEOUT_MS = 10000; // 10s
const EXECUTE_TIMEOUT_MS = 3000;  // 3s per test case
const MEMORY_LIMIT_KB = 256 * 1024; // 256MB in KB

// --- Helper Functions ---

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

/**
 * NEW: Executes a shell command inside a Docker container using file-based I/O.
 */
async function runInDocker(image, hostDir, commandString, timeout) {
  return new Promise((resolve) => {
    const containerDir = '/usr/src/app';
    const resolvedHostDir = path.resolve(hostDir);

    // Use 'sh -c' to execute the full command, allowing I/O redirection like <, >.
    const dockerArgs = [
      'run', '--rm', '--network=none',
      `--memory=${Math.floor(MEMORY_LIMIT_KB / 1024)}m`,
      '--cpus=1',
      '-v', `${resolvedHostDir}:${containerDir}`,
      '-w', containerDir,
      image,
      'sh', '-c', commandString // The key change!
    ];

    const proc = spawn('docker', dockerArgs);
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    }, timeout);

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut });
    });

    proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: 1, signal: null, timedOut: false, internalError: true, stderr: err.message });
    });
  });
}

/**
 * NEW: Parses the verbose output of /usr/bin/time to get memory and time usage.
 */
function parseTimeOutput(timeOutput) {
    const memoryMatch = timeOutput.match(/Maximum resident set size \(kbytes\): (\d+)/);
    const timeMatch = timeOutput.match(/User time \(seconds\): ([\d.]+)/);
    
    const memoryKB = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
    const timeSec = timeMatch ? parseFloat(timeMatch[1]) : 0;

    return { memoryKB, timeMs: timeSec * 1000 };
}

// --- Main Submission Processing Logic ---

async function processSubmission(submissionId) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    console.error(`Invalid submissionId: ${submissionId}`);
    return;
  }

  let sub = await Submissions.findById(submissionId);
  if (!sub) { return; }

  const userId = sub.userId;
  await updateSubmission(sub._id, userId, { status: 'Running', result: { passedCount: 0, totalCount: 0 } });

  const [problem, langConfig] = await Promise.all([
      Problems.findById(sub.problemId).lean(),
      getLanguageConfig(sub.language)
  ]);

  if (!langConfig) {
    await updateSubmission(sub._id, userId, { status: 'Runtime Error', result: { error: `Language '${sub.language}' is not supported.` } });
    return;
  }
  
  const tmpdir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'judge-'));

  try {
    await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), sub.code);

    // 1. COMPILE STEP (if needed)
    if (langConfig.compileCmd) {
      await updateSubmission(sub._id, userId, { status: 'Compiling' });
      const compileCommand = `${langConfig.compileCmd.cmd} ${langConfig.compileCmd.args.join(' ')} > /dev/null 2> error.log`;
      const compResult = await runInDocker(langConfig.image, tmpdir, compileCommand, COMPILE_TIMEOUT_MS);

      if (compResult.code !== 0) {
        const stderr = await fs.readFile(path.join(tmpdir, 'error.log'), 'utf8').catch(() => 'Compilation Failed');
        await updateSubmission(sub._id, userId, { status: 'Compilation Error', result: { error: stderr } });
        return;
      }
    }

    // 2. EXECUTION STEP (for each test case)
    const testcases = problem?.testcases || [];
    let passedCount = 0;
    let totalRuntime = 0;
    let maxMemory = 0;

    for (let i = 0; i < testcases.length; i++) {
      const t = testcases[i];
      await updateSubmission(sub._id, userId, { status: 'Running', result: { passedCount, totalCount: testcases.length } });

      const inputFile = 'input.txt';
      const outputFile = 'output.txt';
      const errorFile = 'error.log';
      const timeFile = 'time.log';

      await fs.writeFile(path.join(tmpdir, inputFile), t.input || '');
      
      const runCommand = `${langConfig.runCmd.cmd} ${langConfig.runCmd.args.join(' ')}`;
      const execString = `/usr/bin/time -v -o ${timeFile} ${runCommand} < ${inputFile} > ${outputFile} 2> ${errorFile}`;
      const execResult = await runInDocker(langConfig.image, tmpdir, execString, EXECUTE_TIMEOUT_MS);

      const timeLog = await fs.readFile(path.join(tmpdir, timeFile), 'utf8').catch(() => '');
      const { memoryKB, timeMs } = parseTimeOutput(timeLog);
      totalRuntime += timeMs;
      if (memoryKB > maxMemory) maxMemory = memoryKB;

      if (execResult.timedOut) {
        await updateSubmission(sub._id, userId, { status: 'Time Limit Exceeded', runtime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length } });
        return;
      }

      if (memoryKB > MEMORY_LIMIT_KB) {
        await updateSubmission(sub._id, userId, { status: 'Memory Limit Exceeded', runtime, memory: Math.round(memoryKB / 1024), result: { passedCount, totalCount: testcases.length } });
        return;
      }

      if (execResult.code !== 0) {
        const stderr = await fs.readFile(path.join(tmpdir, errorFile), 'utf8').catch(() => 'Runtime Error');
        await updateSubmission(sub._id, userId, { status: 'Runtime Error', runtime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length, error: stderr } });
        return;
      }
      
      const userOutput = await fs.readFile(path.join(tmpdir, outputFile), 'utf8').catch(() => '');
      const expectedOutput = (t.output || '').trim();
      const actualOutput = userOutput.trim();

      if (actualOutput === expectedOutput) {
        passedCount++;
      } else {
        const failedTestcase = {
          input: t.isHidden ? 'Hidden Test Case' : t.input,
          expectedOutput: t.isHidden ? 'Hidden Test Case' : expectedOutput,
          userOutput: actualOutput
        };
        await updateSubmission(sub._id, userId, { status: 'Wrong Answer', runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length, failedTestcases: failedTestcase } });
        return;
      }
    }

    // 3. FINAL VERDICT
    const finalStatus = (passedCount === testcases.length) ? 'Accepted' : 'Wrong Answer';
    await updateSubmission(sub._id, userId, {
      status: finalStatus,
      runtime: totalRuntime,
      memory: Math.round(maxMemory / 1024),
      result: { passedCount, totalCount: testcases.length }
    });
    
    if (finalStatus === 'Accepted') {
        await Problems.findByIdAndUpdate(sub.problemId, { $inc: { acceptedSubmissions: 1, totalSubmissions: 1 } });
    } else {
        await Problems.findByIdAndUpdate(sub.problemId, { $inc: { totalSubmissions: 1 } });
    }

  } catch (err) {
    console.error(`Critical error processing submission ${submissionId}:`, err);
    await updateSubmission(submissionId, userId, { status: 'Runtime Error', result: { error: 'An internal judge error occurred.' } }).catch(e => console.error('Failed to update status after critical error:', e));
  } finally {
    fsSync.rmSync(tmpdir, { recursive: true, force: true });
  }
}

// --- Worker Lifecycle ---

let isStopping = false;

async function startWorker() {
  console.log('Judge worker started. Waiting for submissions.');
  while (!isStopping) {
    try {
      const result = await redisWorkerClient.brPop(SUBMISSION_QUEUE, 0);
      if (result && !isStopping) {
        const submissionId = result.element;
        console.log(`Processing submission: ${submissionId}`);
        processSubmission(submissionId).catch(err => {
            console.error(`Unhandled exception in processSubmission for ${submissionId}:`, err);
        });
      }
    } catch (err) {
      if (isStopping || (err.message && err.message.includes('Connection is closed'))) {
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
    if (redisWorkerClient.isOpen) {
        redisWorkerClient.disconnect().catch(err => console.error('Error disconnecting redis for worker shutdown', err));
    }
  }
}

process.on('SIGTERM', stopWorker);
process.on('SIGINT', stopWorker);

module.exports = { startWorker, stopWorker };