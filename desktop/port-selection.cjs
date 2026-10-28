'use strict';
const { randomUUID } = require('node:crypto');

function cleanPort(port) {
  if (!port || typeof port.portId !== 'string' || !port.portId) return null;
  const text = (name) => typeof port[name] === 'string' ? port[name].slice(0, 200) : '';
  return { portId: port.portId, portName: text('portName'), displayName: text('displayName'),
    vendorId: text('vendorId'), productId: text('productId') };
}

class PortSelection {
  constructor(notify, timeoutMs = 120000) {
    this.notify = notify;
    this.timeoutMs = timeoutMs;
    this.pending = null;
  }
  start(ports, callback) {
    this.cancel();
    const available = new Map();
    for (const raw of ports) {
      const port = cleanPort(raw);
      if (port) available.set(port.portId, port);
    }
    this.pending = { requestId: randomUUID(), ports: available, callback, timer: null };
    this.pending.timer = setTimeout(() => this.cancel(), this.timeoutMs);
    this.pending.timer.unref?.();
    this.publish();
  }
  publish() {
    this.notify(this.pending ? { requestId: this.pending.requestId, ports: [...this.pending.ports.values()] } : null);
  }
  update(kind, raw) {
    if (!this.pending) return;
    const port = cleanPort(raw);
    if (!port) return;
    if (kind === 'removed') this.pending.ports.delete(port.portId);
    else this.pending.ports.set(port.portId, port);
    this.publish();
  }
  choose(requestId, portId) {
    if (!this.pending || requestId !== this.pending.requestId || typeof portId !== 'string') return false;
    if (portId !== '' && !this.pending.ports.has(portId)) return false;
    this.finish(portId);
    return true;
  }
  cancel() {
    if (this.pending) this.finish('');
  }
  finish(portId) {
    const request = this.pending;
    if (!request) return;
    this.pending = null;
    clearTimeout(request.timer);
    this.publish();
    request.callback(portId);
  }
}
module.exports = { PortSelection, cleanPort };
