const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../shared/sync-core.js');

test('clock: median offset, outlier ignored', function (t) {
  t.mock.method(Date, 'now', function () { return 10000; });
  var c = S.createClock();
  assert.equal(c.now(), 10000);
  [1, 2, 3, 4].forEach(function () { c.addSample(1000, 5100, 1200); });
  assert.ok(Math.abs(c.now() - (Date.now() + 4000)) <= 5);
  c.addSample(0, 999999, 0);
  assert.ok(Math.abs(c.now() - (Date.now() + 4000)) <= 5);
});

test('clock: keeps only latest 5 samples', function (t) {
  t.mock.method(Date, 'now', function () { return 0; });
  var c = S.createClock();
  for (var i = 0; i < 5; i++) c.addSample(0, 100, 0); // offset 100
  for (var j = 0; j < 5; j++) c.addSample(0, 200, 0); // offset 200
  assert.equal(c.now(), 200);
});

test('elapsedMs', function () {
  assert.equal(S.elapsedMs({ playing: true, t: 0, serverT0: 1000 }, 4000), 3000);
  assert.equal(S.elapsedMs({ playing: true, t: 0, serverT0: 5000 }, 4000), 0);
  assert.equal(S.elapsedMs({ playing: false, t: 0, serverT0: 1000 }, 4000), 0);
  assert.equal(S.elapsedMs(undefined, 4000), 0);
});

test('throttle: leading + trailing, drops middle', function (t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  var calls = [];
  var th = S.createThrottle(function (v) { calls.push(v); }, 50);
  th.call(1); th.call(2); th.call(3);
  assert.deepEqual(calls, [1]);
  t.mock.timers.tick(50);
  assert.deepEqual(calls, [1, 3]);
});

test('throttle: flush sends pending immediately', function (t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  var calls = [];
  var th = S.createThrottle(function (v) { calls.push(v); }, 50);
  th.call(1); th.call(2);
  th.flush();
  assert.deepEqual(calls, [1, 2]);
  t.mock.timers.tick(100);
  assert.deepEqual(calls, [1, 2]);
});

test('nextRole', function () {
  assert.equal(S.nextRole('student-follow', 'explore'), 'student-explore');
  assert.equal(S.nextRole('student-explore', 'follow'), 'student-follow');
  ['teacher', 'student-follow', 'student-explore', 'none'].forEach(function (r) {
    assert.equal(S.nextRole(r, 'closed'), 'none');
  });
  assert.equal(S.nextRole('teacher', 'explore'), 'teacher');
});

test('topicIdFromPath', function () {
  assert.equal(S.topicIdFromPath('/topics/emfield/'), 'emfield');
  assert.equal(S.topicIdFromPath('/topics/emfield'), 'emfield');
  assert.equal(S.topicIdFromPath('/topics/emfield/index.html'), 'emfield');
  assert.equal(S.topicIdFromPath('/'), null);
  assert.equal(S.topicIdFromPath('/index.html'), null);
  assert.equal(S.topicIdFromPath(''), null);
});

test('backoffFor', function () {
  assert.deepEqual(S.BACKOFF_MS, [1000, 2000, 5000, 10000]);
  assert.equal(S.backoffFor(0), 1000);
  assert.equal(S.backoffFor(3), 10000);
  assert.equal(S.backoffFor(99), 10000);
});
