import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const work = resolve(root, '.audio-audition');
mkdirSync(work, { recursive: true });
const candidates = process.argv.includes('--candidates');
const production = process.argv.includes('--production');
const pack = process.argv.includes('--pack');
const audit = process.argv.includes('--audit');
const quality = process.argv.includes('--quality');
const args = process.argv.slice(2).filter(arg => !['--candidates','--production','--pack','--audit','--quality'].includes(arg));
const script = `scripts/audio-audition/${quality ? 'quality' : audit ? 'audit' : pack ? 'pack' : production ? 'production' : candidates ? 'candidates' : 'generate'}.py`;
const localPython = resolve(work, 'venv/bin/python');
const direct = (production || pack || audit || quality) && existsSync(localPython);
const child = spawn(direct ? localPython : 'uv', direct ? ['-u', script, ...args] : ['run', '--python', '3.12', '--project', 'scripts/audio-audition', '--locked', 'python', '-u', script, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UV_PROJECT_ENVIRONMENT: resolve(work, 'venv'), UV_CACHE_DIR: resolve(work, 'uv-cache'), HF_HOME: resolve(work, 'huggingface'), HF_HUB_DISABLE_XET: '1', HF_HUB_DISABLE_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false', PYTHONDONTWRITEBYTECODE: '1' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
