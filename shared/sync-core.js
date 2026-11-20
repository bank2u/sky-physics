/* shared/sync-core.js — logic ล้วนของ live sync ฝั่ง client (ไม่แตะ DOM, ไม่มี dependency)
   UMD: Node ใช้ module.exports, browser ใช้ window.SyncCore ผ่าน <script> ธรรมดา */
(function (root) {
  var BACKOFF_MS = [1000, 2000, 5000, 10000];
  var CLOCK_SAMPLES = 5;

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  // นาฬิกาเซิร์ฟเวอร์: offset = median ของ 5 sample ล่าสุด
  function createClock() {
    var offsets = [];
    return {
      addSample: function (sentAt, serverNow, receivedAt) {
        offsets.push(serverNow - (sentAt + receivedAt) / 2);
        if (offsets.length > CLOCK_SAMPLES) offsets.shift();
      },
      now: function () {
        return Date.now() + (offsets.length ? median(offsets) : 0);
      }
    };
  }

  function elapsedMs(play, serverNow) {
    return play && play.playing ? Math.max(0, serverNow - play.serverT0) : 0;
  }

  // leading + trailing: เรียกครั้งแรกทันที ค่าสุดท้ายในช่วงถูกส่งเสมอเมื่อครบ interval
  function createThrottle(fn, intervalMs) {
    var timer = null;
    var pending = null;

    function fire() {
      timer = null;
      if (pending) {
        var args = pending.args;
        pending = null;
        fn.apply(null, args);
        timer = setTimeout(fire, intervalMs);
      }
    }

    return {
      call: function () {
        var args = Array.prototype.slice.call(arguments);
        if (timer === null) {
          fn.apply(null, args);
          timer = setTimeout(fire, intervalMs);
        } else {
          pending = { args: args };
        }
      },
      flush: function () {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (pending) {
          var args = pending.args;
          pending = null;
          fn.apply(null, args);
        }
      }
    };
  }

  function nextRole(role, event) {
    if (event === 'closed') return 'none';
    if (role === 'student-follow' && event === 'explore') return 'student-explore';
    if (role === 'student-explore' && event === 'follow') return 'student-follow';
    return role;
  }

  // /topics/<id>, /topics/<id>/, /topics/<id>/index.html → <id>; อื่นๆ → null
  function topicIdFromPath(pathname) {
    var m = /\/topics\/([^\/]+)(?:\/(?:index\.html)?)?$/.exec(pathname || '');
    return m ? m[1] : null;
  }

  function backoffFor(attempt) {
    return BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
  }

  var api = {
    createClock: createClock,
    elapsedMs: elapsedMs,
    createThrottle: createThrottle,
    nextRole: nextRole,
    topicIdFromPath: topicIdFromPath,
    BACKOFF_MS: BACKOFF_MS,
    backoffFor: backoffFor
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SyncCore = api;
})(typeof window !== 'undefined' ? window : this);
