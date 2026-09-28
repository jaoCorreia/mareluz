import { WebSocketServer } from 'ws';
import { normalizeMotionPacket } from '../src/motion-protocol.js';

export function attachRelay(server, { publicOrigin, allowOtherUpgrades = false } = {}) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const send = (peer, data) => {
    if (peer?.readyState === 1 && peer.bufferedAmount < 32768) peer.send(JSON.stringify(data));
  };
  const onUpgrade = (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
    if (pathname !== '/relay') {
      if (!allowOtherUpgrades) socket.destroy();
      return;
    }
    const expectedOrigin = publicOrigin || (request.socket.encrypted ? 'https://' : 'http://') + request.headers.host;
    if (request.headers.origin !== expectedOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  };
  server.on('upgrade', onUpgrade);
  wss.on('connection', ws => {
    let roomCode = null;
    let role = null;
    let joins = 0;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('message', raw => {
      let data;
      try { data = JSON.parse(String(raw)); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'join') {
        if (roomCode || ++joins > 8) { ws.close(1008, 'Too many join attempts'); return; }
        if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code) || !['game', 'controller'].includes(data.role)) return;
        const code = data.code;
        const room = rooms.get(code) || {};
        if (data.role === 'game') {
          if (typeof data.token !== 'string' || data.token.length < 20 || data.token.length > 80) return;
          if (room.token && room.token !== data.token) { send(ws, { type: 'error', code: 'ROOM_TAKEN', message: 'Código já em uso. Reabra o jogo.' }); return; }
          if (!rooms.has(code) && rooms.size >= 256) { send(ws, { type: 'error', message: 'Servidor cheio. Tente novamente em instantes.' }); return; }
          room.token = data.token;
        } else {
          if (!room.game || room.game.readyState !== 1) { send(ws, { type: 'error', message: 'Jogo não encontrado.' }); return; }
          if (room.controller?.readyState === 1) { send(ws, { type: 'error', message: 'Já existe um controle conectado.' }); return; }
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
      const room = rooms.get(roomCode);
      if (!room || room[role] !== ws) return;
      if (role === 'controller' && data.type === 'motion') {
        const packet = normalizeMotionPacket(data);
        if (packet) send(room.game, packet);
      }
      if (role === 'game' && data.type === 'feedback' && ['hit', 'damage'].includes(data.event)) send(room.controller, { type: 'feedback', event: data.event });
    });
    ws.on('close', () => {
      const room = rooms.get(roomCode);
      if (!room || room[role] !== ws) return;
      delete room[role];
      send(room.game, { type: 'peer', connected: Boolean(room.controller) });
      send(room.controller, { type: 'peer', connected: Boolean(room.game) });
      if (!room.game && !room.controller) rooms.delete(roomCode);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref();
  return () => {
    clearInterval(heartbeat);
    server.off('upgrade', onUpgrade);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    rooms.clear();
  };
}
