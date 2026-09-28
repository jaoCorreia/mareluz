import { defineConfig } from 'vite';
import { WebSocketServer } from 'ws';
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
      const rooms = new Map();
      const wss = new WebSocketServer({ noServer: true });
      server.middlewares.use('/api/network', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ address: lanAddress() }));
      });
      server.httpServer.on('upgrade', (request, socket, head) => {
        if (new URL(request.url, 'https://localhost').pathname !== '/relay') return;
        const expectedOrigin = `${process.env.LOCAL_HTTP ? 'http' : 'https'}://${request.headers.host}`;
        if (request.headers.origin !== expectedOrigin) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
      });
      wss.on('connection', ws => {
        let roomCode = null;
        let role = null;
        const send = (peer, value) => {
          if (peer?.readyState === 1) peer.send(JSON.stringify(value));
        };
        ws.on('message', raw => {
          let data;
          try { data = JSON.parse(String(raw)); } catch { return; }
          if (data.type === 'join') {
            const code = String(data.code || '').replace(/\D/g, '').slice(0, 6);
            if (code.length !== 6 || !['game', 'controller'].includes(data.role)) return;
            const room = rooms.get(code) || {};
            if (data.role === 'controller' && !room.game) {
              send(ws, { type: 'error', message: 'Jogo não encontrado.' });
              return;
            }
            if (room[data.role] && room[data.role] !== ws) room[data.role].close();
            roomCode = code;
            role = data.role;
            room[role] = ws;
            rooms.set(code, room);
            send(ws, { type: 'joined', role });
            send(room.game, { type: 'peer', connected: Boolean(room.controller) });
            send(room.controller, { type: 'peer', connected: Boolean(room.game) });
            return;
          }
          if (!roomCode || !role) return;
          const room = rooms.get(roomCode);
          if (!room || room[role] !== ws) return;
          if (role === 'controller' && data.type === 'motion') {
            send(room.game, {
              type: 'motion',
              x: Number(data.x) || 0,
              y: Number(data.y) || 0,
              speed: Number(data.speed) || 0,
              swing: Boolean(data.swing)
            });
          }
          if (role === 'game' && data.type === 'feedback') send(room.controller, data);
        });
        ws.on('close', () => {
          if (!roomCode || !role) return;
          const room = rooms.get(roomCode);
          if (!room || room[role] !== ws) return;
          delete room[role];
          send(room.game, { type: 'peer', connected: Boolean(room.controller) });
          send(room.controller, { type: 'peer', connected: Boolean(room.game) });
          if (!room.game && !room.controller) rooms.delete(roomCode);
        });
      });
      server.httpServer.on('close', () => wss.close());
    }
  };
}

export default defineConfig({
  build: { rollupOptions: { input: { game: path.resolve('index.html'), controller: path.resolve('controller.html') } } },
  server: { host: process.env.LOCAL_HTTP ? '127.0.0.1' : '0.0.0.0', port: process.env.LOCAL_HTTP ? 5174 : 5173, strictPort: true, https: process.env.LOCAL_HTTP ? undefined : certificate() },
  plugins: [motionRelay()]
});
