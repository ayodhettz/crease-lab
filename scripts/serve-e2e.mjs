import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const localPython = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : 'python');
const temp = mkdtempSync(join(tmpdir(), 'crease-e2e-'));
const child = spawn(
  python,
  ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000'],
  {
    stdio: 'inherit',
    env: { ...process.env, CREASE_DATA_DIR: temp },
  },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill());
child.on('error', (error) => {
  console.error(error);
  rmSync(temp, { recursive: true, force: true });
  process.exit(1);
});
child.on('exit', (code) => {
  rmSync(temp, { recursive: true, force: true });
  process.exit(code || 0);
});
