import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { connect as connectTcp } from 'node:net';
import WebSocket from 'ws';
import { attachRelay } from '../server/relay.js';

async function fixture(t) {
  const server = createServer();
  const origin = 'https://mareluz.example';
  const stop = attachRelay(server, { publicOrigin: origin });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { stop(); await new Promise(resolve => server.close(resolve)); });
  return {
    url: `ws://127.0.0.1:${server.address().port}/relay`, origin,
    async connect() {
      const ws = new WebSocket(this.url, { origin });
      await once(ws, 'open');
      const queue = [];
      let waiter;
      ws.on('message', raw => { const data = JSON.parse(raw); if (waiter) { const done = waiter; waiter = null; done(data); } else queue.push(data); });
      return {
        ws, send: data => ws.send(JSON.stringify(data)),
        next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => { waiter = resolve; }),
      };
    },
  };
}
const gameJoin = { type: 'join', role: 'game', code: '123456', token: 'a'.repeat(48) };
const controllerJoin = { type: 'join', role: 'controller', code: '123456' };

test('production relay pairs through TLS proxy and preserves ordered motion and feedback', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  const game = await f.connect();
  game.send(gameJoin);
  assert.deepEqual(await game.next(), { type: 'joined', role: 'game' });
  assert.equal((await game.next()).connected, false);
  const controller = await f.connect();
  controller.send(controllerJoin);
  assert.equal((await controller.next()).type, 'joined');
  assert.equal((await controller.next()).connected, true);
  assert.equal((await game.next()).connected, true);
  const samples = [1, 2, 3].map(seq => ({ seq, x: seq / 10, y: 0, time: seq * 16, speed: 2, strokeId: 1, active: true, reset: false, calibrating: false }));
  const motion = { type: 'motion', version: 2, stream: 'phone', samples };
  controller.send(motion);
  assert.deepEqual(await game.next(), motion);
  game.send({ type: 'feedback', event: 'hit', extra: 'stripped' });
  assert.deepEqual(await controller.next(), { type: 'feedback', event: 'hit' });
  controller.ws.close();
  assert.equal((await game.next()).connected, false);
});

test('unknown room and second controller cannot take over a game', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  const controller = await f.connect();
  controller.send(controllerJoin);
  assert.equal((await controller.next()).type, 'error');
  const game = await f.connect();
  game.send(gameJoin); await game.next(); await game.next();
  controller.send(controllerJoin); await controller.next(); await controller.next(); await game.next();
  const other = await f.connect();
  other.send(controllerJoin);
  assert.match((await other.next()).message, /Já existe/);
  other.send({ ...gameJoin, token: 'b'.repeat(48) });
  assert.equal((await other.next()).code, 'ROOM_TAKEN');
});

test('cross-origin websocket upgrades are rejected', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  const ws = new WebSocket(f.url, { origin: 'https://untrusted.example' });
  const [error] = await once(ws, 'error');
  assert.match(error.message, /403/);
});

test('malformed upgrade targets cannot crash the relay', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  const socket = connectTcp(Number(new URL(f.url).port), '127.0.0.1');
  await once(socket, 'connect');
  socket.write('GET //[/relay HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  const [response] = await once(socket, 'data');
  assert.match(response.toString(), /400 Bad Request/);
  socket.destroy();
  const game = await f.connect();
  game.send(gameJoin);
  assert.equal((await game.next()).type, 'joined');
});
