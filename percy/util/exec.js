const { execFile } = require('child_process');

function exec(cmd, args = [], { timeoutMs = 5000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({
        stdout: stdout || Buffer.from(''),
        stderr: stderr || Buffer.from('')
      });
    });
  });
}

module.exports = { exec };
