const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '../..');
const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

function extractImages(payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || (fs.existsSync(localPython) ? localPython : 'python'),
      ['-m', 'src.extractors.bridge'], {
        cwd: root, windowsHide: true, shell: false,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Python image extraction timed out'));
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) > 4 * 1024 * 1024) {
        child.kill();
        reject(new Error('Python extraction output exceeded byte limit'));
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-1000); });
    child.stdin.on('error', (error) => { child.kill(); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error('Python image extractor failed (exit ' + code + '). Check Python dependencies.'));
        return;
      }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Python extractor returned invalid JSON')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
module.exports = { extractImages };
