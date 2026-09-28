import { defineConfig } from 'vite';
import { attachRelay } from './server/relay.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const localDir = path.resolve('.local');
const keyPath = path.join(localDir, 'server-key.pem');
const certPath = path.join(localDir, 'server-cert.pem');

function lanAddress() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const entry of interfaces[name] || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return 'localhost';
}

function certificate() {
  let needsCertificate = !existsSync(keyPath) || !existsSync(certPath);
  if (!needsCertificate) {
    try {
      const details = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-text']).toString();
      needsCertificate = !details.includes(`IP Address:${lanAddress()}`);
    } catch { needsCertificate = true; }
  }
  if (needsCertificate) {
    mkdirSync(localDir, { recursive: true });
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
      '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost',
      '-addext', `subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${lanAddress()}`
    ], { stdio: 'ignore' });
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

function motionRelay() {
  return {
    name: 'motion-relay',
    configureServer(server) {
      server.middlewares.use('/api/network', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ address: lanAddress() }));
      });
      const stopRelay = attachRelay(server.httpServer, { allowOtherUpgrades: true });
      server.httpServer.once('close', stopRelay);
    }
  };
}

export default defineConfig(({ command }) => ({
  build: { rollupOptions: { input: { game: path.resolve('index.html'), controller: path.resolve('controller.html'), runner: path.resolve('corredor.html'), runnerController: path.resolve('corredor-controle.html') } } },
  server: { host: process.env.LOCAL_HTTP ? '127.0.0.1' : '0.0.0.0', port: process.env.LOCAL_HTTP ? 5174 : 5173, strictPort: true, https: command === 'serve' && !process.env.LOCAL_HTTP ? certificate() : undefined },
  plugins: [motionRelay()]
}));
