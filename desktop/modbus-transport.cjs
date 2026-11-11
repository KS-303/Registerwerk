'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const error = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
function validCrc(frame) {
  return frame.length >= 4 && crc16(frame.subarray(0, -2)) === frame.readUInt16LE(frame.length - 2);
}
function rtuLength(bytes, offset) {
  if (bytes.length - offset < 2) return 0;
  if (bytes[offset] < 1 || bytes[offset] > 247) return -1;
  const fc = bytes[offset + 1];
  if ([129, 130, 131, 132, 133, 134, 143, 144].includes(fc)) return 5;
  if ([5, 6, 15, 16].includes(fc)) return 8;
  if (![1, 2, 3, 4].includes(fc)) return -1;
  if (bytes.length - offset < 3) return 0;
  const count = bytes[offset + 2];
  return count < 1 || count > 250 || (fc >= 3 && count % 2) ? -1 : count + 5;
}
// Both inputs include the unit byte, but no CRC or MBAP header.
function matchesResponse(response, request) {
  if (response[0] !== request[0]) return false;
  if (response[1] === (request[1] | 128)) return response.length === 3;
  if (response[1] !== request[1]) return false;
  if ([1, 2, 3, 4].includes(request[1])) {
    const qty = request.readUInt16BE(4);
    const count = request[1] <= 2 ? Math.ceil(qty / 8) : qty * 2;
    return response[2] === count && response.length === count + 3;
  }
  return response.length === 6 && response.subarray(2).equals(request.subarray(2, 6));
}

class ModbusTransport {
  constructor({ readOnly = () => true, onClosed = () => {}, onNotice = () => {} } = {}) {
    this.readOnly = readOnly;
    this.onClosed = onClosed;
    this.onNotice = onNotice;
    this.current = null;
  }
  close(reason = error('CONNECTION_LOST', 'TCP-Verbindung wurde geschlossen.')) {
    const current = this.current;
    if (!current) return;
    this.current = null;
    clearTimeout(current.connectTimer);
    current.connectReject?.(reason);
    this.finish(current, reason);
    current.socket.destroy();
    this.onClosed({ sessionId: current.id, message: reason.message });
  }
  async connect(host, port) {
    this.close();
    const socket = net.createConnection({ host, port });
    socket.setNoDelay(true);
    const current = { id: randomUUID(), socket, buffer: Buffer.alloc(0), pending: null,
      busy: false, mode: null, transaction: 0, expired: new Set(), lastActivity: 0, recoveryMs: 0, ready: false };
    this.current = current;
    socket.on('data', chunk => { if (this.current === current) this.receive(current, chunk); });
    socket.on('error', cause => {
      if (this.current === current) this.close(error('CONNECTION_LOST', `TCP-Verbindung fehlgeschlagen: ${cause.message}`));
    });
    socket.on('close', () => {
      if (this.current === current) this.close(error('CONNECTION_LOST', 'TCP-Verbindung wurde unterbrochen.'));
    });
    return new Promise((resolve, reject) => {
      current.connectReject = reject;
      current.connectTimer = setTimeout(() => {
        if (this.current === current) this.close(error('CONNECTION_LOST', 'TCP-Verbindungsaufbau überschritt 5 Sekunden.'));
      }, 5000);
      socket.once('connect', () => {
        if (this.current !== current) return;
        clearTimeout(current.connectTimer);
        current.connectReject = null;
        current.ready = true;
        resolve(current.id);
      });
    });
  }
  disconnect(id) { if (this.current?.id === id) this.close(); }
  finish(current, failure, response) {
    const pending = current.pending;
    if (!pending) return;
    current.pending = null;
    clearTimeout(pending.timer);
    if (failure) pending.reject(failure);
    else pending.resolve(Array.from(response));
  }
  notice(current, message) {
    // At most one notice per request; noise must not flood the UI/IPC.
    if (current.pending && !current.pending.noticed) {
      current.pending.noticed = true;
      this.onNotice({ sessionId: current.id, message });
    }
  }
  receive(current, chunk) {
    current.lastActivity = Date.now();
    if (current.mode === 'ethRtu' && !current.pending) { current.buffer = Buffer.alloc(0); return; }
    if (!current.mode) return;
    // Consume incrementally: coalesced frames must not trigger a false overflow.
    for (let start = 0; start < chunk.length; start += 256) {
      current.buffer = Buffer.concat([current.buffer, chunk.subarray(start, start + 256)]);
      if (current.mode === 'tcp') {
        while (current.buffer.length >= 6) {
          const length = current.buffer.readUInt16BE(4);
          if (current.buffer.readUInt16BE(2) !== 0 || length < 2 || length > 254) {
            this.close(error('CONNECTION_LOST', 'Ungültiger Modbus-TCP-Header; Datenstrom nicht mehr sicher lesbar.'));
            return;
          }
          if (current.buffer.length < length + 6) break;
          const response = current.buffer.subarray(0, length + 6);
          current.buffer = current.buffer.subarray(length + 6);
          const pending = current.pending;
          if (!pending || response.readUInt16BE(0) !== pending.transactionId) {
            this.notice(current, 'RX · verspätete oder fremde TCP-Transaktions-ID ignoriert.');
            continue;
          }
          if (!matchesResponse(response.subarray(6), pending.request.subarray(0, -2))) {
            this.finish(current, error('PROTOCOL_ERROR', 'Modbus-TCP-Antwort passt nicht zu Unit-ID, Funktion oder erwarteter Länge.'));
          } else this.finish(current, null, response);
        }
      } else {
        this.receiveRtu(current);
        if (current.buffer.length > 512) current.buffer = current.buffer.subarray(-512);
      }
    }
  }
  receiveRtu(current) {
    while (current.pending && current.buffer.length >= 2) {
      const pending = current.pending, request = pending.request, buffer = current.buffer;
      // FC05/06 echoes cannot be distinguished from acknowledgements; UI reads back.
      if (![5, 6].includes(request[1]) && buffer.subarray(0, Math.min(buffer.length, request.length)).equals(request.subarray(0, Math.min(buffer.length, request.length)))) {
        if (buffer.length >= request.length) {
          current.buffer = buffer.subarray(request.length);
          this.notice(current, 'RX · Echo des eigenen RTU-Telegramms ignoriert.');
          continue;
        }
        const length = rtuLength(buffer, 0);
        if (!(length > 0 && length <= buffer.length && validCrc(buffer.subarray(0, length)) && matchesResponse(buffer.subarray(0, length - 2), request.subarray(0, -2)))) return;
      }
      let found = false;
      for (let offset = 0; offset + 4 < buffer.length; offset++) {
        const length = rtuLength(buffer, offset);
        if (length <= 0 || offset + length > buffer.length) continue;
        const response = buffer.subarray(offset, offset + length);
        if (!validCrc(response)) continue;
        current.buffer = buffer.subarray(offset + length);
        found = true;
        if (offset) this.notice(current, `RX · ${offset} Störbyte(s) vor gültigem RTU-Frame verworfen.`);
        if (matchesResponse(response.subarray(0, -2), request.subarray(0, -2))) this.finish(current, null, response);
        else this.notice(current, 'RX · fremde oder unpassende RTU-Antwort ignoriert.');
        break;
      }
      if (found) continue;
      const length = rtuLength(buffer, 0);
      if (length === -1 || (length > 0 && buffer.length >= length)) {
        pending.corrupt = true;
        current.buffer = buffer.subarray(1);
        this.notice(current, 'RX · RTU-Stördaten oder CRC-Fehler; Empfang wird neu ausgerichtet.');
      } else return;
    }
    if (!current.pending) current.buffer = Buffer.alloc(0);
  }
  async waitQuiet(current) {
    if (!current.recoveryMs) return;
    this.onNotice({ sessionId: current.id, recovery: true,
      message: `Ethernet-RTU · warte auf ${current.recoveryMs} ms Ruhe; höchstens ${current.recoveryMs * 3} ms. Noch keine Anfrage gesendet.` });
    const started = Date.now(), limit = current.recoveryMs * 3;
    while (Date.now() - current.lastActivity < current.recoveryMs) {
      if (this.current !== current) throw error('CANCELLED', 'Verbindung während der Ruhephase getrennt.');
      if (Date.now() - started >= limit) throw error('BUS_NOT_IDLE', 'Ethernet-RTU: keine ausreichende Ruhephase; keine Anfrage gesendet. Gateway und Fremdverkehr prüfen.');
      await delay(Math.min(25, current.recoveryMs));
    }
    current.recoveryMs = 0;
    current.buffer = Buffer.alloc(0);
  }
  async exchange(id, bytes, mode, timeoutMs, guardMs = 0) {
    const current = this.current;
    if (!current || current.id !== id || !current.ready || current.socket.destroyed) throw error('CONNECTION_LOST', 'Keine aktive TCP-Verbindung.');
    if (current.busy) throw error('BUSY', 'Eine TCP-Anfrage ist noch offen.');
    if (!Array.isArray(bytes) || bytes.length < 8 || bytes.length > 256 || !bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) throw error('INVALID_REQUEST', 'Ungültiges Modbus-Telegramm.');
    if (!['tcp', 'ethRtu'].includes(mode) || !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000 || !Number.isInteger(guardMs) || guardMs < 0 || guardMs > 5000) throw error('INVALID_REQUEST', 'Ungültige TCP-Anfrageparameter.');
    if (current.mode && mode !== current.mode) throw error('INVALID_REQUEST', 'Vor einem Protokollwechsel die Verbindung trennen.');
    if (this.readOnly() && ![1, 2, 3, 4].includes(bytes[1])) throw error('READ_ONLY', 'Nur-Lesen ist aktiv. Erlaubt sind ausschließlich FC 01–04.');
    if (![1, 2, 3, 4, 5, 6, 15, 16].includes(bytes[1])) throw error('INVALID_REQUEST', 'Nicht unterstützter Funktionscode.');
    if (mode === 'ethRtu' && (bytes[0] < 1 || bytes[0] > 247)) throw error('INVALID_REQUEST', 'RTU-Geräteadresse muss zwischen 1 und 247 liegen.');
    const request = Buffer.from(bytes);
    if (!validCrc(request)) throw error('INVALID_REQUEST', 'Ungültige Anfrage-CRC.');
    current.mode = mode;
    current.busy = true;
    try {
      if (mode === 'ethRtu') await this.waitQuiet(current);
      if (this.current !== current) throw error('CANCELLED', 'Verbindung wurde getrennt.');
      if (this.readOnly() && ![1, 2, 3, 4].includes(bytes[1])) throw error('READ_ONLY', 'Nur-Lesen ist aktiv. Erlaubt sind ausschließlich FC 01–04.');
      // Timed-out IDs are never reused on this socket. Completed IDs can wrap normally.
      if (mode === 'tcp' && current.expired.size === 65536) {
        const cause = error('CONNECTION_LOST', 'Alle TCP-Transaktionsnummern durch Timeouts belegt. Bitte neu verbinden.');
        this.close(cause);
        throw cause;
      }
      while (mode === 'tcp' && current.expired.has(current.transaction)) current.transaction = (current.transaction + 1) & 0xffff;
      const transactionId = mode === 'tcp' ? current.transaction : null;
      if (mode === 'tcp') current.transaction = (current.transaction + 1) & 0xffff;
      let outgoing = request;
      if (mode === 'tcp') {
        const header = Buffer.alloc(6);
        header.writeUInt16BE(transactionId, 0);
        header.writeUInt16BE(request.length - 2, 4);
        outgoing = Buffer.concat([header, request.subarray(0, -2)]);
      }
      return await new Promise((resolve, reject) => {
        const pending = { request, transactionId, resolve, reject, timer: null };
        current.pending = pending;
        pending.timer = setTimeout(() => {
          if (current.pending !== pending) return;
          if (mode === 'ethRtu') {
            current.buffer = Buffer.alloc(0);
            current.lastActivity = Date.now();
            current.recoveryMs = Math.max(250, timeoutMs, guardMs);
          } else current.expired.add(transactionId);
          this.finish(current, error('TIMEOUT', `Keine gültige Antwort innerhalb von ${timeoutMs} ms.${pending.corrupt ? ' Empfang enthielt Stördaten oder CRC-Fehler.' : ''}`, { timeoutMs }));
        }, timeoutMs);
        current.socket.write(outgoing, cause => {
          if (cause && this.current === current) this.close(error('CONNECTION_LOST', `TCP-Senden fehlgeschlagen: ${cause.message}`));
        });
      });
    } finally { current.busy = false; }
  }
}

module.exports = { ModbusTransport, crc16, matchesResponse };
