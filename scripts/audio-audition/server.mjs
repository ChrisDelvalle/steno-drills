import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const publicRoot = resolve(root, '.audio-audition/public');
const page = fileURLToPath(new URL('./index.html', import.meta.url));
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex < 0 ? 4174 : process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535.');
const types = { html: 'text/html; charset=utf-8', json: 'application/json', wav: 'audio/wav', opus: 'audio/ogg' };
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { ...security, Allow: 'GET, HEAD' }); response.end(); return; }
    const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    let file;
    if (path === '/' || path === '/index.html') file = page;
    else if (['/auditions.json', '/candidates.json', '/compression.json'].includes(path) || /^\/clips\/[a-z]+\/[a-z]+(?:\.(?:6|8|10|12|16|20|24))?\.(?:wav|opus)$/.test(path)) {
      file = await realpath(resolve(publicRoot, path.slice(1)));
      if (!file.startsWith(await realpath(publicRoot) + sep)) throw new Error('Invalid path');
    } else { response.writeHead(404, security); response.end('Not found'); return; }
    if (file === page || file.endsWith('.json')) {
      const contents = await readFile(file);
      response.writeHead(200, { ...security, 'Content-Type': types[file.split('.').at(-1)], 'Content-Length': String(contents.length) });
      response.end(request.method === 'HEAD' ? undefined : contents);
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const headers = { ...security, 'Content-Type': types[file.split('.').at(-1)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    let start = 0, end = info.size - 1, code = 200;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
      if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
      else start = Math.max(0, info.size - Number(match[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
      code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    response.writeHead(code, headers);
    if (request.method === 'HEAD') response.end();
    else {
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    }
  } catch { if (!response.headersSent) response.writeHead(404, security); response.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try npm run audio:audition -- --port ${port + 1}` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Audio auditions: http://127.0.0.1:${port}/`));
