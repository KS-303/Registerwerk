'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PortSelection } = require('../desktop/port-selection.cjs');
const port = (id) => ({ portId: id, portName: 'COM' + id });
test('Kein Adapter wird automatisch ausgewaehlt; nur passende Anfrage und vorhandener Port werden akzeptiert', () => {
  const events = [], replies = [], chooser = new PortSelection((value) => events.push(value));
  chooser.start([port('1'), port('2')], (value) => replies.push(value));
  const id = events.at(-1).requestId;
  assert.deepEqual(replies, []);
  assert.equal(chooser.choose('veraltet', '2'), false);
  assert.equal(chooser.choose(id, 'unbekannt'), false);
  assert.equal(chooser.choose(id, '2'), true);
  assert.deepEqual(replies, ['2']);
  assert.equal(chooser.choose(id, '2'), false);
  assert.equal(events.at(-1), null);
});
test('Abgezogener Adapter wird entfernt und kann nicht mehr gewaehlt werden', () => {
  const events = [], replies = [], chooser = new PortSelection((v) => events.push(v));
  chooser.start([port('1')], (v) => replies.push(v));
  const id = events.at(-1).requestId;
  chooser.update('removed', port('1'));
  assert.equal(chooser.choose(id, '1'), false);
  chooser.update('added', port('3'));
  assert.equal(chooser.choose(id, '3'), true);
  assert.deepEqual(replies, ['3']);
});
test('Abbruch und neue Anfrage beantworten den alten Callback genau einmal', () => {
  const replies = [], chooser = new PortSelection(() => {});
  chooser.start([], (v) => replies.push('alt:' + v));
  chooser.start([], (v) => replies.push('neu:' + v));
  chooser.cancel(); chooser.cancel();
  assert.deepEqual(replies, ['alt:', 'neu:']);
});
test('Eine unbeantwortete Portauswahl endet nach der Frist', async () => {
  const replies = [], chooser = new PortSelection(() => {}, 15);
  chooser.start([], (v) => replies.push(v));
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(replies, ['']);
  assert.equal(chooser.pending, null);
});
