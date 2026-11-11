'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { ModbusTransport } = require('../desktop/modbus-transport.cjs');

// Independent test encoder, including a published CRC vector below.
function frame(body) {
  let crc = 65535;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 40961 : crc >>> 1;
  }
  return Buffer.from([...body, crc & 255, crc >> 8]);
}
const request = (unit = 1, address = 0, fc = 3) => [...frame([unit, fc, address >> 8, address & 255, 0, 1])];
const reply = (req, value = 42) => Buffer.from([req[0], req[1], 0, 0, 0, 5, req[6], req[7], 2, value >> 8, value & 255]);
async function setup(t, mode, handler, options = {}) {
  const sockets = new Set(), seen = [], closed = [], notices = [];
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let bytes = Buffer.alloc(0);
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      while (bytes.length >= 8) {
        const size = mode === 'tcp' ? 6 + bytes.readUInt16BE(4) : 8;
        if (bytes.length < size) return;
        const req = bytes.subarray(0, size); bytes = bytes.subarray(size);
        seen.push(req); handler(socket, req, seen.length);
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new ModbusTransport({ onClosed: value => closed.push(value), onNotice: value => notices.push(value), ...options });
  t.after(async () => { client.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const id = await client.connect('127.0.0.1', server.address().port);
  return { client, id, seen, closed, notices, port: server.address().port,
    exchange: (bytes = request(), timeout = 80, guard = 0) => client.exchange(id, bytes, mode, timeout, guard) };
}

test('TCP: Timeout lässt Socket offen; verspätete fragmentierte Antwort wird per ID ignoriert', async t => {
  let old, sameSocket;
  const h = await setup(t, 'tcp', (socket, req, count) => {
    if (count === 1) { old = req; sameSocket = socket; return; }
    assert.equal(socket, sameSocket);
    const combined = Buffer.concat([reply(old, 999), reply(req, 42)]);
    socket.write(combined.subarray(0, 4));
    setTimeout(() => socket.write(combined.subarray(4)), 10);
  });
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  assert.equal(h.closed.length, 0);
  assert.equal(Buffer.from(await h.exchange(request(2))).readUInt16BE(9), 42);
  assert(h.notices.some(n => /Transaktions-ID/.test(n.message)));
});

test('TCP: partieller verspäteter Header bleibt über Anfragen erhalten', async t => {
  let rest;
  const h = await setup(t, 'tcp', (socket, req, count) => {
    if (count === 1) { const r = reply(req, 999); rest = r.subarray(3); socket.write(r.subarray(0, 3)); }
    else socket.write(Buffer.concat([rest, reply(req, 123)]));
  });
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  assert.equal(Buffer.from(await h.exchange(request(1, 1))).readUInt16BE(9), 123);
});

test('TCP: Unit-ID 0 und 255, atomweise Fragmente und Modbus-Ausnahme', async t => {
  const h = await setup(t, 'tcp', (socket, req, count) => {
    const response = count === 3 ? Buffer.from([req[0], req[1], 0, 0, 0, 3, req[6], 131, 2]) : reply(req);
    [...response].forEach((byte, index) => setTimeout(() => socket.write(Buffer.from([byte])), index * 2));
  });
  for (const unit of [0, 255]) assert.equal((await h.exchange(request(unit)))[6], unit);
  assert.equal((await h.exchange())[7], 131);
});

test('TCP: Unit-ID/Funktion/Länge prüfen; fehlerhafte PDU trennt keinen intakten Socket', async t => {
  const h = await setup(t, 'tcp', (socket, req, count) => {
    const r = reply(req);
    if (count === 1) r[6] = 2;
    if (count === 2) r[7] = 4;
    if (count === 3) r[8] = 4;
    socket.write(r);
  });
  for (let i = 0; i < 3; i++) await assert.rejects(h.exchange(), { code: 'PROTOCOL_ERROR' });
  assert.equal((await h.exchange())[10], 42);
  assert.equal(h.closed.length, 0);
});

for (const bad of ['protocol', 'length', 'closed']) test(`TCP: echter Verbindungsfehler (${bad}) beendet offene Anfrage`, async t => {
  const h = await setup(t, 'tcp', (socket, req) => {
    if (bad === 'closed') return socket.destroy();
    const r = reply(req); r[bad === 'protocol' ? 3 : 4] = 1; socket.write(r);
  });
  await assert.rejects(h.exchange(), { code: 'CONNECTION_LOST' });
  assert.equal(h.closed.length, 1);
  assert.equal(h.client.current, null);
});

test('TCP: Transaktions-ID-Umlauf überspringt abgelaufene IDs', async t => {
  const h = await setup(t, 'tcp', (socket, req, count) => { if (count > 1) socket.write(reply(req)); });
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  h.client.current.transaction = 65535;
  await h.exchange(); await h.exchange();
  assert.deepEqual(h.seen.map(r => r.readUInt16BE(0)), [0, 65535, 1]);
});

test('Ethernet-RTU: Echo, Störbytes, falsche ID/FC/Länge, CRC und Fragmentierung', async t => {
  const h = await setup(t, 'ethRtu', (socket, req) => {
    const bad = frame([1, 3, 2, 0, 7]); bad[6] ^= 1;
    socket.write(req.subarray(0, 3));
    setTimeout(() => {
      socket.write(Buffer.concat([req.subarray(3), Buffer.from([255, 0, 99]), frame([2, 3, 2, 0, 10]), frame([1, 4, 2, 0, 10]), frame([1, 3, 4, 0, 1, 0, 2]), bad, frame([1, 3, 2, 0, 42])]));
    }, 10);
  });
  assert.deepEqual(request(), [1, 3, 0, 0, 0, 1, 132, 10]);
  assert.deepEqual(await h.exchange(), [...frame([1, 3, 2, 0, 42])]);
  assert.equal(h.closed.length, 0);
});

test('Ethernet-RTU: Timeout, späte gleiche Antwort während Ruhephase, Folgeabfrage ohne Reconnect', async t => {
  let lateAt, firstSocket;
  const h = await setup(t, 'ethRtu', (socket, req, count) => {
    if (count === 1) {
      firstSocket = socket;
      setTimeout(() => { lateAt = Date.now(); socket.write(frame([1, 3, 2, 3, 231])); }, 150);
    } else {
      assert.equal(socket, firstSocket);
      assert(Date.now() - lateAt >= 240, 'late frame restarts quiet period');
      socket.write(frame([1, 3, 2, 0, 42]));
    }
  });
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  assert.deepEqual(await h.exchange(request(1, 2)), [...frame([1, 3, 2, 0, 42])]);
  assert.equal(h.closed.length, 0);
});

test('Ethernet-RTU: Dauerverkehr beendet Ruhephase begrenzt ohne weitere Anfrage', async t => {
  let noise;
  const h = await setup(t, 'ethRtu', socket => { noise = setInterval(() => socket.write(Buffer.from([255])), 20); });
  t.after(() => clearInterval(noise));
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  await assert.rejects(h.exchange(), { code: 'BUS_NOT_IDLE' });
  assert.equal(h.seen.length, 1);
  assert.equal(h.closed.length, 0);
});

test('Ethernet-RTU: Rauschen bleibt begrenzt; nächste gültige Antwort wird erkannt', async t => {
  const h = await setup(t, 'ethRtu', socket => socket.write(Buffer.concat([Buffer.alloc(20000, 255), frame([1, 3, 2, 0, 42])])));
  assert.equal((await h.exchange(request(), 1000))[4], 42);
  assert(h.client.current.buffer.length <= 512);
});

test('Ethernet-RTU: Modbus-Ausnahme und FC06-Quittung bleiben unterstützt', async t => {
  const h = await setup(t, 'ethRtu', (socket, req) => socket.write(req[1] === 6 ? req : frame([1, 131, 2])), { readOnly: () => false });
  assert.deepEqual(await h.exchange(), [...frame([1, 131, 2])]);
  assert.deepEqual(await h.exchange(request(1, 0, 6)), request(1, 0, 6));
});

for (const mode of ['tcp', 'ethRtu']) test(`${mode}: Nur-Lesen erlaubt ausschließlich FC01–04 vor Socket-Ausgabe`, async t => {
  const h = await setup(t, mode, () => {});
  for (const fc of [5, 6, 15, 16, 22, 23, 43, 65, 255]) await assert.rejects(h.exchange(request(1, 0, fc)), { code: 'READ_ONLY' });
  assert.equal(h.seen.length, 0);
});

test('Ethernet-RTU: Unit-ID 0/248/255 und defekte Anfrage-CRC werden abgelehnt', async t => {
  const h = await setup(t, 'ethRtu', () => {});
  for (const unit of [0, 248, 255]) await assert.rejects(h.exchange(request(unit)), { code: 'INVALID_REQUEST' });
  const bad = request(); bad[7] ^= 1;
  await assert.rejects(h.exchange(bad), { code: 'INVALID_REQUEST' });
  assert.equal(h.seen.length, 0);
});

test('TCP: Parallelaufruf und alte Sitzungs-ID abgewiesen; manuelles Trennen verwirft Anfrage', async t => {
  const h = await setup(t, 'tcp', () => {});
  const pending = h.exchange(request(), 1000);
  const rejected = assert.rejects(pending, { code: 'CONNECTION_LOST' });
  await assert.rejects(h.exchange(), { code: 'BUSY' });
  h.client.disconnect(h.id); await rejected;
  const newId = await h.client.connect('127.0.0.1', h.port);
  await assert.rejects(h.exchange(), { code: 'CONNECTION_LOST' });
  h.client.disconnect(h.id); assert.equal(h.client.current.id, newId);
});

test('Ethernet-RTU: Trennen während Ruhephase sendet keinen Folgeauftrag', async t => {
  const h = await setup(t, 'ethRtu', () => {});
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  const pending = h.exchange();
  const rejected = assert.rejects(pending, { code: 'CANCELLED' });
  await delay(30); h.client.disconnect(h.id); await rejected;
  assert.equal(h.seen.length, 1);
});

test('Nur-Lesen: FC01–04 bleiben über TCP und Ethernet-RTU lesbar', async t => {
  for (const mode of ['tcp', 'ethRtu']) {
    const h = await setup(t, mode, (socket, req) => {
      const unit = req[mode === 'tcp' ? 6 : 0], fc = req[mode === 'tcp' ? 7 : 1];
      const body = fc <= 2 ? [unit, fc, 1, 1] : [unit, fc, 2, 0, 42];
      socket.write(mode === 'tcp' ? Buffer.from([req[0], req[1], 0, 0, 0, body.length, ...body]) : frame(body));
    });
    for (const fc of [1, 2, 3, 4]) assert.equal((await h.exchange(request(1, 0, fc)))[mode === 'tcp' ? 7 : 1], fc);
    assert.equal(h.seen.length, 4);
  }
});

test('Ethernet-RTU: während Ruhephase aktiviertes Nur-Lesen blockiert wartenden Schreibbefehl', async t => {
  let readOnly = false;
  const h = await setup(t, 'ethRtu', () => {}, { readOnly: () => readOnly });
  await assert.rejects(h.exchange(), { code: 'TIMEOUT' });
  const pending = h.exchange(request(1, 0, 6));
  const rejected = assert.rejects(pending, { code: 'READ_ONLY' });
  await delay(30); readOnly = true; await rejected;
  assert.equal(h.seen.length, 1);
});
