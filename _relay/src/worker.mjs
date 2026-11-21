// Cloudflare Worker + Durable Object wrapper around the pure room logic.
import { DurableObject } from 'cloudflare:workers';
import {
  TTL_MS, randomCode, createRecord, roleFor, handleMessage,
} from './room.mjs';

const MAX_CODE_TRIES = 20;
const PERSIST_MS = 2000;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  } : {};
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    // Browsers always send Origin; non-browser clients send none and are allowed.
    if (origin && !allowedOrigins(env).includes(origin)) {
      return new Response('forbidden', { status: 403 });
    }
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (request.method === 'POST' && url.pathname === '/rooms') {
      for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const code = randomCode();
        const token = crypto.randomUUID();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/claim', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        if (res.status === 201) {
          return Response.json({ code, teacherToken: token }, { status: 201, headers: cors });
        }
      }
      return new Response('no free room code', { status: 503, headers: cors });
    }

    const m = url.pathname.match(/^\/rooms\/(\d{4})\/ws$/);
    if (request.method === 'GET' && m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426, headers: cors });
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      const t = url.searchParams.get('t') || '';
      return stub.fetch(`https://room/ws?t=${encodeURIComponent(t)}`, request);
    }

    return new Response('not found', { status: 404, headers: cors });
  },
};

export class Room extends DurableObject {
  record = undefined; // undefined = not loaded, null = no room
  dirty = false;
  lastPut = 0;
  flushTimer = null;

  // ROOM_TTL_MS is a dev/test-only override (wrangler dev --var ROOM_TTL_MS:3000).
  get ttl() {
    const n = Number(this.env.ROOM_TTL_MS);
    return Number.isFinite(n) && n > 0 ? n : TTL_MS;
  }

  isExpired(rec, now) {
    return rec.closed || now - rec.lastActivity >= this.ttl;
  }

  async load() {
    if (this.record === undefined) this.record = (await this.ctx.storage.get('record')) ?? null;
    return this.record;
  }

  async live() {
    const rec = await this.load();
    return rec && !this.isExpired(rec, Date.now()) ? rec : null;
  }

  // Write-throttling: the hot path (teacher patches/pings ~20 Hz) only updates the in-memory record;
  // storage.put happens immediately on first patch / topicId change / close, otherwise at most once per
  // PERSIST_MS via a trailing timer. If the DO hibernates or is evicted before the trailing write, up to
  // PERSIST_MS of the newest params are lost — acceptable: the teacher republishes full state on reconnect.
  // The alarm is armed only in /claim and re-arms itself from lastActivity in alarm().
  async flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.dirty || !this.record) return;
    this.dirty = false;
    this.lastPut = Date.now();
    try { await this.ctx.storage.put('record', this.record); } catch (e) { console.error('persist failed', e); }
  }

  persist(rec, immediate) {
    this.record = rec;
    this.dirty = true;
    if (immediate || Date.now() - this.lastPut >= PERSIST_MS) return this.flush();
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => { this.flush(); }, PERSIST_MS - (Date.now() - this.lastPut));
    }
    return Promise.resolve();
  }

  async destroy(closeMsg) {
    const sockets = this.ctx.getWebSockets();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.record = null;
    this.dirty = false;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    for (const ws of sockets) {
      try {
        if (closeMsg) ws.send(JSON.stringify(closeMsg));
        ws.close(1000, closeMsg ? closeMsg.reason : 'closed');
      } catch { /* already closed */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/claim') {
      if (await this.live()) return new Response('taken', { status: 409 });
      const { token } = await request.json();
      if (this.record) await this.destroy({ type: 'closed', reason: 'expired' }); // stale/closed leftovers: tell sockets
      await this.persist(createRecord(token, Date.now()), true);
      try { await this.ctx.storage.setAlarm(Date.now() + this.ttl); } catch (e) { console.error('alarm failed', e); }
      return new Response('ok', { status: 201 });
    }

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const rec = await this.live();
      if (!rec) {
        server.accept();
        server.send(JSON.stringify({ type: 'closed', reason: 'not-found' }));
        server.close(1000, 'not-found');
        return new Response(null, { status: 101, webSocket: client });
      }
      const role = roleFor(rec, url.searchParams.get('t'));
      this.ctx.acceptWebSocket(server, [role]);
      server.send(JSON.stringify({ type: 'welcome', role, state: rec.state, serverNow: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws, message) {
    const rec = await this.live();
    if (!rec) {
      ws.send(JSON.stringify({ type: 'closed', reason: 'not-found' }));
      ws.close(1000, 'not-found');
      return;
    }
    const role = this.ctx.getTags(ws)[0];
    const result = handleMessage(rec, role, message, Date.now());
    const topicChanged = result.record.state.topicId !== rec.state.topicId;
    if (result.reply) ws.send(JSON.stringify(result.reply));
    if (result.broadcast) {
      const out = JSON.stringify(result.broadcast);
      for (const s of this.ctx.getWebSockets()) {
        try { s.send(out); } catch { /* socket gone */ }
      }
    }
    // broadcast already went out above; persistence is throttled and its failures are caught in flush()
    if (result.record.closed) await this.destroy(null);
    else if (result.record !== rec) await this.persist(result.record, topicChanged);
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* already closed */ }
  }

  async alarm() {
    const rec = await this.load();
    if (!rec) return;
    if (this.isExpired(rec, Date.now())) {
      await this.destroy({ type: 'closed', reason: 'expired' });
    } else {
      await this.ctx.storage.setAlarm(rec.lastActivity + this.ttl);
    }
  }
}
