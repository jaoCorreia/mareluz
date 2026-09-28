import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { attachRelay } from './relay.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('Execute npm run build antes de iniciar o servidor.');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'accelerometer=(self), gyroscope=(self)');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  if (pathname === '/health') {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
    return;
  }
  const target = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(dist) || pathname.includes('\0')) { response.writeHead(403); response.end(); return; }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    response.setHeader('Content-Type', mimeTypes[path.extname(target)] || 'application/octet-stream');
    response.setHeader('Content-Length', info.size);
    response.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(target);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch { response.writeHead(404); response.end('Não encontrado'); }
});

const publicOrigin = process.env.PUBLIC_ORIGIN || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : undefined);
const stopRelay = attachRelay(server, { publicOrigin });
const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log('Maré de Luz listening on port ' + port));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopRelay();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});
