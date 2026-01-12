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
const COMPILE_TIMEOUT_MS = 10000;
const EXECUTE_TIMEOUT_MS = 3000;
const MEMORY_LIMIT_KB = 256 * 1024;
const USER_CODE_PLACEHOLDER = '//{{USER_CODE}}'; // Placeholder for LeetCode-style templating

async function updateSubmission(submissionId, userId, updateData) {
    const submission = await Submissions.findByIdAndUpdate(submissionId, { $set: updateData }, { new: true });
    if (submission) {
        const eventType = 'submission_update';
        console.log(`Notifying user ${userId} about ${eventType}: ${submission.status}`);
        socketService.sendToUser(userId.toString(), { type: eventType, payload: submission.toObject() });
    }
    return submission;
}

async function runInDocker(image, hostDir, commandString, timeout) {
  return new Promise((resolve) => {
    const containerDir = '/usr/src/app';
    const resolvedHostDir = path.resolve(hostDir);
    const dockerArgs = [
      'run', '-i', '--rm', '--network=none',
      `--memory=${Math.floor(MEMORY_LIMIT_KB / 1024)}m`, '--cpus=1',
      '-v', `${resolvedHostDir}:${containerDir}`,
      '-w', containerDir, image,
      'sh', '-c', commandString
    ];
    const proc = spawn('docker', dockerArgs);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    }, timeout);
    proc.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut }); });
    proc.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, signal: null, timedOut: false, internalError: true, stderr: err.message }); });
  });
}

function parseTimeOutput(timeOutput) {
    const memoryMatch = timeOutput.match(/Maximum resident set size \(kbytes\): (\d+)/);
    const timeMatch = timeOutput.match(/User time \(seconds\): ([\d.]+)/);
    const memoryKB = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
    const timeSec = timeMatch ? parseFloat(timeMatch[1]) : 0;
    return { memoryKB, timeMs: timeSec * 1000 };
}


// --- Main Submission Processing Logic (with Templating) ---

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

  if (!problem || !langConfig) {
    await updateSubmission(sub._id, userId, { status: 'Runtime Error', result: { error: 'Problem or Language not found.' } });
    return;
  }

  // --- LEETCODE-STYLE TEMPLATING LOGIC ---
  const codeTemplate = problem.codeTemplates?.find(t => t.language === sub.language);
  let finalCode = sub.code; // Default to user code if no template exists
  if (codeTemplate) {
      if (!codeTemplate.template.includes(USER_CODE_PLACEHOLDER)) {
          await updateSubmission(sub._id, userId, { status: 'Runtime Error', result: { error: `Problem Misconfiguration: Code template for ${sub.language} is missing the placeholder.` } });
          return;
      }
      finalCode = codeTemplate.template.replace(USER_CODE_PLACEHOLDER, sub.code);
  } 
  // --- END OF TEMPLATING LOGIC ---
  
  const tmpdir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'judge-'));

  try {
    // Write the final, combined code to the source file
    await fs.writeFile(path.join(tmpdir, langConfig.srcFileName), finalCode);

    if (langConfig.compileCmd) {
      await updateSubmission(sub._id, userId, { status: 'Compiling' });
      const compileScript = `#!/bin/sh\nset -e\n${langConfig.compileCmd.cmd} ${langConfig.compileCmd.args.join(' ')} > /dev/null 2> error.log`;
      await fs.writeFile(path.join(tmpdir, 'compile.sh'), compileScript);
      const compResult = await runInDocker(langConfig.image, tmpdir, 'chmod +x compile.sh && ./compile.sh', COMPILE_TIMEOUT_MS);

      if (compResult.code !== 0) {
        const stderr = await fs.readFile(path.join(tmpdir, 'error.log'), 'utf8').catch(() => 'Compilation Failed');
        await updateSubmission(sub._id, userId, { status: 'Compilation Error', result: { error: stderr } });
        return;
      }
    }

    const testcases = problem.testcases || [];
    let passedCount = 0, totalRuntime = 0, maxMemory = 0;

    for (let i = 0; i < testcases.length; i++) {
      const t = testcases[i];
      await updateSubmission(sub._id, userId, { status: 'Running', result: { passedCount, totalCount: testcases.length } });

      const inputFile = 'input.txt', outputFile = 'output.txt', errorFile = 'error.log', timeFile = 'time.log';
      await fs.writeFile(path.join(tmpdir, inputFile), t.input || '');
      
      const runCommand = `${langConfig.runCmd.cmd} ${langConfig.runCmd.args.join(' ')}`;
      const runnerScript = `#!/bin/sh\nset -e\n/usr/bin/time -v -o ${timeFile} ${runCommand} < ${inputFile} > ${outputFile} 2> ${errorFile}`;
      await fs.writeFile(path.join(tmpdir, 'run.sh'), runnerScript);
      
      const execResult = await runInDocker(langConfig.image, tmpdir, 'chmod +x run.sh && ./run.sh', EXECUTE_TIMEOUT_MS);

      const timeLog = await fs.readFile(path.join(tmpdir, timeFile), 'utf8').catch(() => '');
      const { memoryKB, timeMs } = parseTimeOutput(timeLog);
      totalRuntime += timeMs; if (memoryKB > maxMemory) maxMemory = memoryKB;

      if (execResult.timedOut) {
        await updateSubmission(sub._id, userId, { status: 'Time Limit Exceeded', runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length } });
        return;
      }
      if (memoryKB > MEMORY_LIMIT_KB) {
        await updateSubmission(sub._id, userId, { status: 'Memory Limit Exceeded', runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length } });
        return;
      }
      if (execResult.code !== 0) {
        const stderr = await fs.readFile(path.join(tmpdir, errorFile), 'utf8').catch(() => 'Runtime Error');
        await updateSubmission(sub._id, userId, { status: 'Runtime Error', runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length, error: stderr } });
        return;
      }
      
      const userOutput = await fs.readFile(path.join(tmpdir, outputFile), 'utf8').catch(() => '');
      const actualOutput = userOutput.trim(), expectedOutput = (t.output || '').trim();

      if (actualOutput === expectedOutput) {
        passedCount++;
      } else {
        await updateSubmission(sub._id, userId, { status: 'Wrong Answer', runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length, failedTestcases: { input: t.isHidden ? 'Hidden' : t.input, expectedOutput: t.isHidden ? 'Hidden' : expectedOutput, userOutput: actualOutput } } });
        return;
      }
    }

    const finalStatus = (passedCount === testcases.length) ? 'Accepted' : 'Wrong Answer';
    await updateSubmission(sub._id, userId, { status: finalStatus, runtime: totalRuntime, memory: Math.round(maxMemory / 1024), result: { passedCount, totalCount: testcases.length }});
    
    await Problems.findByIdAndUpdate(sub.problemId, { $inc: { totalSubmissions: 1, ...(finalStatus === 'Accepted' && { acceptedSubmissions: 1 }) } });

  } catch (err) {
    console.error(`Critical error processing submission ${submissionId}:`, err);
    await updateSubmission(submissionId, userId, { status: 'Runtime Error', result: { error: 'An internal judge error occurred.' } }).catch(e => console.error('Failed to update status after critical error:', e));
  } finally {
    fsSync.rmSync(tmpdir, { recursive: true, force: true });
  }
}

// --- Worker Lifecycle (No changes) ---

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
