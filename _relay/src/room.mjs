// Pure room logic for the live-sync relay. No I/O, no dependencies.

export const TTL_MS = 10_800_000;
export const MAX_MSG_BYTES = 16_384;

export function randomCode(rand = Math.random) {
  const n = Math.min(9999, Math.floor(rand() * 10000));
  return String(n).padStart(4, '0');
}

export function createRecord(token, now) {
  return {
    token,
    state: { topicId: null, params: {} },
    lastActivity: now,
    closed: false,
  };
}

export function roleFor(record, token) {
  return token != null && token === record.token ? 'teacher' : 'viewer';
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function applyPatch(state, patch) {
  let next = { ...state, params: { ...(state.params || {}) } };
  if ('topicId' in patch && patch.topicId !== state.topicId) {
    next = { topicId: patch.topicId, params: {} };
  }
  for (const key of ['supported', 'play', 'camera']) {
    if (key in patch) next[key] = patch[key];
  }
  if (isObj(patch.params)) next.params = { ...next.params, ...patch.params };
  return next;
}

export function handleMessage(record, role, raw, now) {
  const none = { record, broadcast: null, reply: null };
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_MSG_BYTES) return none;
  let msg;
  try { msg = JSON.parse(raw); } catch { return none; }
  if (!isObj(msg)) return none;

  if (msg.type === 'ping') {
    const next = role === 'teacher' ? { ...record, lastActivity: now } : record;
    return { record: next, broadcast: null, reply: { type: 'pong', id: msg.id, serverNow: now } };
  }
  if (role !== 'teacher') return none;

  if (msg.type === 'patch' && isObj(msg.state)) {
    const state = applyPatch(record.state, msg.state);
    return {
      record: { ...record, state, lastActivity: now },
      broadcast: { type: 'state', state, serverNow: now },
      reply: null,
    };
  }
  if (msg.type === 'close') {
    return {
      record: { ...record, closed: true, lastActivity: now },
      broadcast: { type: 'closed', reason: 'teacher' },
      reply: null,
    };
  }
  return none;
}

export function isExpired(record, now) {
  return record.closed || now - record.lastActivity >= TTL_MS;
}
