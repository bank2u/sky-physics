import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TTL_MS, MAX_MSG_BYTES, randomCode, createRecord, roleFor,
  applyPatch, handleMessage, isExpired,
} from '../src/room.mjs';

test('constants', () => {
  assert.equal(TTL_MS, 10_800_000);
  assert.equal(MAX_MSG_BYTES, 16_384);
});

test('randomCode is 4-digit zero padded', () => {
  assert.equal(randomCode(() => 0), '0000');
  assert.equal(randomCode(() => 0.99999), '9999');
  assert.equal(randomCode(() => 0.0421), '0421');
});

test('createRecord shape', () => {
  assert.deepEqual(createRecord('abc', 5), {
    token: 'abc', state: { topicId: null, params: {} }, lastActivity: 5, closed: false,
  });
});

test('roleFor', () => {
  const r = createRecord('abc', 0);
  assert.equal(roleFor(r, 'abc'), 'teacher');
  assert.equal(roleFor(r, 'x'), 'viewer');
  assert.equal(roleFor(r, null), 'viewer');
});

test('applyPatch: topic change clears other fields', () => {
  const s = { topicId: 'a', params: { x: 1 }, play: { playing: true, t: 0, serverT0: 5 } };
  assert.deepEqual(applyPatch(s, { topicId: 'b' }), { topicId: 'b', params: {} });
});

test('applyPatch: params merge per key, no mutation', () => {
  const s = { topicId: 'a', params: { x: 1, y: 2 } };
  const copy = structuredClone(s);
  const out = applyPatch(s, { params: { y: 3 } });
  assert.deepEqual(out.params, { x: 1, y: 3 });
  assert.deepEqual(s, copy);
});

test('applyPatch: same topic keeps existing params', () => {
  const s = { topicId: 'a', params: { x: 1 } };
  const out = applyPatch(s, { topicId: 'a', params: { z: 1 } });
  assert.deepEqual(out.params, { x: 1, z: 1 });
});

test('applyPatch: play/camera/supported replace whole', () => {
  const s = { topicId: 'a', params: {}, play: { playing: true, t: 1, serverT0: 2 }, camera: { theta: 1, phi: 2 } };
  const out = applyPatch(s, { play: { playing: false, t: 3 }, camera: { theta: 5 }, supported: true });
  assert.deepEqual(out.play, { playing: false, t: 3 });
  assert.deepEqual(out.camera, { theta: 5 });
  assert.equal(out.supported, true);
});

test('viewer patch is dropped', () => {
  const rec = createRecord('tok', 0);
  const before = structuredClone(rec);
  const res = handleMessage(rec, 'viewer', '{"type":"patch","state":{"topicId":"evil"}}', 10);
  assert.equal(res.broadcast, null);
  assert.deepEqual(res.record.state, before.state);
  assert.deepEqual(rec, before);
});

test('teacher patch broadcasts merged state', () => {
  const rec = createRecord('tok', 0);
  const before = structuredClone(rec);
  const res = handleMessage(rec, 'teacher', '{"type":"patch","state":{"topicId":"p","params":{"a":1}}}', 99);
  assert.deepEqual(res.broadcast, { type: 'state', state: { topicId: 'p', params: { a: 1 } }, serverNow: 99 });
  assert.equal(res.record.lastActivity, 99);
  assert.deepEqual(res.record.state, { topicId: 'p', params: { a: 1 } });
  assert.deepEqual(rec, before);
});

test('ping gets pong', () => {
  const res = handleMessage(createRecord('t', 0), 'viewer', '{"type":"ping","id":7}', 50);
  assert.deepEqual(res.reply, { type: 'pong', id: 7, serverNow: 50 });
  assert.equal(res.broadcast, null);
});

test('teacher close', () => {
  const res = handleMessage(createRecord('t', 0), 'teacher', '{"type":"close"}', 5);
  assert.deepEqual(res.broadcast, { type: 'closed', reason: 'teacher' });
  assert.equal(res.record.closed, true);
});

test('viewer close ignored', () => {
  const res = handleMessage(createRecord('t', 0), 'viewer', '{"type":"close"}', 5);
  assert.equal(res.broadcast, null);
  assert.equal(res.record.closed, false);
});

test('invalid and oversize messages dropped silently', () => {
  for (const raw of ['not json', 'x'.repeat(16_385)]) {
    const res = handleMessage(createRecord('t', 0), 'teacher', raw, 1);
    assert.equal(res.broadcast, null);
    assert.equal(res.reply, null);
  }
});

test('isExpired', () => {
  assert.equal(isExpired(createRecord('t', 0), TTL_MS - 1), false);
  assert.equal(isExpired(createRecord('t', 0), TTL_MS), true);
  assert.equal(isExpired({ ...createRecord('t', 0), closed: true }, 1), true);
});

test('message cap is measured in UTF-8 bytes', () => {
  const raw = JSON.stringify({ type: 'ping', id: 'ก'.repeat(6000) });
  assert.ok(raw.length < 16_384 && new TextEncoder().encode(raw).length > 16_384);
  const res = handleMessage(createRecord('t', 0), 'viewer', raw, 1);
  assert.equal(res.reply, null);
  assert.equal(res.broadcast, null);
});

test('teacher ping counts as activity', () => {
  const rec = createRecord('t', 0);
  const res = handleMessage(rec, 'teacher', '{"type":"ping","id":1}', 77);
  assert.equal(res.record.lastActivity, 77);
  assert.equal(rec.lastActivity, 0);
  assert.deepEqual(res.reply, { type: 'pong', id: 1, serverNow: 77 });
});

test('viewer ping does not count as activity', () => {
  const res = handleMessage(createRecord('t', 0), 'viewer', '{"type":"ping","id":1}', 77);
  assert.equal(res.record.lastActivity, 0);
});
