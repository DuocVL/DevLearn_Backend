const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Submissions = require('../models/Submissions');
const Problems = require('../models/Problems');

// Simple sequential worker that polls for Pending submissions and processes them one-by-one.
// Note: this is a minimal implementation. In production you should run workers in separate processes
// and use stronger sandboxing (Docker) and resource limits.

const DEFAULT_TIMEOUT_MS = 3000;

async function runCommand(cmd, args, options = {}, input = '', timeout = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, options);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

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
    if (input) proc.stdin.write(input);
    try { proc.stdin.end(); } catch (e) {}
  });
}

async function processSubmission(sub) {
  // mark running
  await Submissions.findByIdAndUpdate(sub._id, { status: 'Running' });
  const problem = await Problems.findById(sub.problemId).lean();
  const testcases = (problem && Array.isArray(problem.testcases)) ? problem.testcases : [];

  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));
  try {
    let srcFile = null;
    let runCmd = null;
    let compileStep = null;

    if (sub.language === 'python') {
      srcFile = path.join(tmpdir, 'main.py');
      fs.writeFileSync(srcFile, sub.code);
      runCmd = { cmd: 'python3', args: [srcFile] };
    } else if (sub.language === 'javascript') {
      srcFile = path.join(tmpdir, 'main.js');
      fs.writeFileSync(srcFile, sub.code);
      runCmd = { cmd: 'node', args: [srcFile] };
    } else if (sub.language === 'cpp') {
      srcFile = path.join(tmpdir, 'main.cpp');
      const exe = path.join(tmpdir, 'a.out');
      fs.writeFileSync(srcFile, sub.code);
      compileStep = { cmd: 'g++', args: [srcFile, '-O2', '-std=c++17', '-o', exe] };
      runCmd = { cmd: exe, args: [] };
    } else {
      await Submissions.findByIdAndUpdate(sub._id, { status: 'Runtime Error', result: { passedCount:0, totalCount:testcases.length } });
      return;
    }

    if (compileStep) {
      const comp = await runCommand(compileStep.cmd, compileStep.args, { cwd: tmpdir });
      if (comp.code !== 0 || comp.timedOut) {
        await Submissions.findByIdAndUpdate(sub._id, { status: 'Compilation Error', result: { passedCount:0, totalCount:testcases.length, error: comp.stderr || comp.stdout } });
        return;
      }
    }

    // run tests sequentially
    let passed = 0;
    let firstFail = null;
    let totalTime = 0;
    for (let i = 0; i < testcases.length; i++) {
      const t = testcases[i];
      const input = t.input || '';
      const expected = (t.output || '').toString().trim();
      const res = await runCommand(runCmd.cmd, runCmd.args, { cwd: tmpdir }, input, DEFAULT_TIMEOUT_MS);
      totalTime += 0; // per-test timing not tracked precisely here
      if (res.timedOut) {
        await Submissions.findByIdAndUpdate(sub._id, { status: 'Time Limit Exceeded', result: { passedCount: passed, totalCount: testcases.length } });
        return;
      }
      if (res.code !== 0 && res.stderr) {
        // treat as runtime error
        await Submissions.findByIdAndUpdate(sub._id, { status: 'Runtime Error', result: { passedCount: passed, totalCount: testcases.length, error: res.stderr } });
        return;
      }
      const out = (res.stdout || '').toString().trim();
      if (out === expected) {
        passed++;
      } else {
        if (!firstFail) firstFail = { input, expectedOutput: expected, userOutput: out };
      }
    }

    const status = (passed === testcases.length) ? 'Accepted' : 'Wrong Answer';
    const result = { passedCount: passed, totalCount: testcases.length };
    if (firstFail) result.failedTestcases = firstFail;

    await Submissions.findByIdAndUpdate(sub._id, { status, result, runtime: totalTime });

    // Optionally update problem stats
    if (status === 'Accepted') {
      await Problems.findByIdAndUpdate(sub.problemId, { $inc: { acceptedSubmissions: 1, totalSubmissions: 1 } });
    } else {
      await Problems.findByIdAndUpdate(sub.problemId, { $inc: { totalSubmissions: 1 } });
    }

  } catch (err) {
    console.error('processSubmission error', err);
    await Submissions.findByIdAndUpdate(sub._id, { status: 'Runtime Error', result: { passedCount:0, totalCount:0, error: String(err) } });
  } finally {
    // cleanup tmpdir
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) {}
  }
}

let _stopping = false;
async function startWorker(pollIntervalMs = 1500) {
  console.log('Judge worker starting...');
  while (!_stopping) {
    try {
      // find one pending submission in FIFO order
      const sub = await Submissions.findOneAndUpdate({ status: { $in: ['Pending'] } }, { status: 'Running' }, { sort: { createdAt: 1 }, new: true });
      if (sub) {
        // we already marked Running above, but processSubmission expects original doc
        await processSubmission(sub);
      } else {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    } catch (err) {
      console.error('Worker loop error', err);
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }
}

function stopWorker() { _stopping = true; }

module.exports = { startWorker, stopWorker };
