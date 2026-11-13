// House of Iyengars(TM) - order service core logic.
// Every outside dependency (Google script, storage, Turnstile, clock) is passed in,
// so the same code runs on Netlify and in automated tests.

export const ID_RE = /^[RSM]\d+-\d{6}-\d{6}$/;
export const RID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SCRIPT_TIMEOUT_MS = 15000;
const PR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// ---- Indian Standard Time helpers (never the server's own timezone) ----
export function istParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}
const pad = n => String(n).padStart(2, '0');
export function istString(date) { const t = istParts(date); return `${t.y}-${pad(t.m)}-${pad(t.d)} ${pad(t.hh)}:${pad(t.mm)}:${pad(t.ss)}`; }
export function label(y, m, d) { return `${pad(d)} ${MONTHS[m - 1]} ${y}`; }
// Before 10:00 AM IST -> same day. Otherwise next day.
export function deliveryDate(now) {
  const t = istParts(now);
  const base = Date.UTC(t.y, t.m - 1, t.d) + (t.hh < 10 ? 0 : 86400000);
  const u = new Date(base);
  const y = u.getUTCFullYear(), m = u.getUTCMonth() + 1, d = u.getUTCDate();
  return { ymd: `${y}-${pad(m)}-${pad(d)}`, label: label(y, m, d), sameDay: t.hh < 10 };
}

export function feeNote(zone, total) {
  if (zone === 'out') return 'As per actuals (beyond 4 km)';
  if (zone === 'in') return total > 1500 ? 'Free delivery' : total >= 500 ? 'Flat Rs 100' : 'Actual delivery charges apply';
  return total >= 500 ? 'To be confirmed on WhatsApp' : 'Actual delivery charges apply';
}

// Same request id always gives the same temporary reference, so retries never create a second one.
export async function prRefFor(requestId) {
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update('hoi-pr:' + requestId).digest();
  let s = ''; for (let i = 0; i < 6; i++) s += PR_ALPHABET[h[i] % PR_ALPHABET.length];
  return 'PR-' + s;
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---- Server-side validation. Prices always come from the menu file, never from the browser. ----
export function validate(body, menu) {
  const f = {};
  if (!body || typeof body !== 'object') return { ok: false, fields: { _: 'Bad request.' } };
  const requestId = String(body.requestId || '');
  if (!RID_RE.test(requestId)) f.requestId = 'Invalid request.';
  const byId = new Map(menu.items.map(i => [i.id, i]));
  const items = [];
  const seen = new Set();
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) f.items = 'Please add at least one item to your cart.';
  else for (const it of body.items) {
    const m = byId.get(String(it && it.id)); const q = it && Number(it.q);
    if (!m || !Number.isInteger(q) || q < 1 || q > 50 || seen.has(m.id)) { f.items = 'Your cart has an item we could not recognise. Please review your cart.'; break; }
    if (m.available === false) { f.items = `${m.name} is not available right now. Please remove it from your cart.`; break; }
    seen.add(m.id); items.push({ id: m.id, n: m.name, q, p: m.price, g: m.g ? 1 : 0 });
  }
  const c = body.customer || {};
  const name = clean(c.name, 60);
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,59}$/u.test(name)) f.name = 'Please enter your name.';
  const phone = String(c.phone ?? '').replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(phone)) f.phone = 'Mobile number must be exactly 10 digits.';
  const address = clean(c.address, 250);
  if (address.length < 15 || !/\b\d{6}\b/.test(address)) f.address = 'Please enter your full address with house number, street, area and 6-digit pincode.';
  const instructions = clean(c.instructions, 200);
  const d = body.delivery || {};
  const zone = ['in', 'out', 'unk'].includes(d.zone) ? d.zone : 'unk';
  const km = Number.isFinite(Number(d.km)) && d.km !== null && Number(d.km) >= 0 && Number(d.km) < 500 ? Math.round(Number(d.km) * 10) / 10 : null;
  const clientTotal = Number(body.clientTotal);
  if (Object.keys(f).length) return { ok: false, fields: f };
  const total = items.reduce((s, i) => s + i.q * i.p, 0);
  const cat = items.some(i => i.g === 0) && items.some(i => i.g === 1) ? 'M' : items.some(i => i.g === 1) ? 'S' : 'R';
  return { ok: true, v: { requestId, items, total, cat, zone, km, name, phone, address, instructions, clientTotal } };
}

export function makeHandlers(deps) {
  const env = n => (deps.getEnv ? deps.getEnv(n) : undefined);
  const log = (type, extra) => { try { (deps.log || console.warn)(JSON.stringify({ type, at: new Date().toISOString(), ...extra })); } catch { /* ignore */ } };
  const clientIp = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '';

  function sameOrigin(req) {
    const o = req.headers.get('origin');
    if (!o) return true;
    try {
      const host = new URL(o).host;
      if (host === new URL(req.url).host) return true;
      return String(env('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean).some(a => { try { return new URL(a).host === host; } catch { return false; } });
    } catch { return false; }
  }

  async function callScript(payload) {
    const url = env('APPS_SCRIPT_URL');
    if (!url) throw new Error('APPS_SCRIPT_URL is not set');
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), SCRIPT_TIMEOUT_MS);
    try {
      const r = await deps.fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, secret: env('APPS_SCRIPT_SECRET') }), redirect: 'follow', signal: ctrl.signal });
      if (!r.ok) throw new Error('script http ' + r.status);
      return JSON.parse(await r.text());
    } finally { clearTimeout(t); }
  }

  // ---- Turnstile diagnostics: safe by design. Never logs the token, the secret or any part of them. ----
  const tag = v => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 40) : null);
  const hostOf = req => { try { const o = req && req.headers.get('origin'); return (o ? new URL(o) : new URL(req.url)).host.toLowerCase(); } catch { return null; } };
  const cleanDiag = d => (!d || typeof d !== 'object') ? null : {
    siteKeyConfigured: d.siteKeyConfigured === true, widgetState: tag(d.widgetState), widgetError: tag(d.widgetError),
    tokenLength: Number.isInteger(d.tokenLength) && d.tokenLength >= 0 && d.tokenLength < 5000 ? d.tokenLength : null, pageHost: tag(d.pageHost) };

  // Same accept/reject behaviour as before (fails closed). It now explains itself in the logs.
  async function verifyTurnstile(token, ip, req, clientDiag) {
    const t0 = Date.now(); const secret = env('TURNSTILE_SECRET');
    const base = { tokenPresent: typeof token === 'string' && token.length > 0, tokenLength: typeof token === 'string' ? token.length : 0,
      secretConfigured: !!secret, secretLength: secret ? String(secret).length : 0, requestHost: hostOf(req), client: cleanDiag(clientDiag) };
    const note = (outcome, stage, extra) => log('turnstile', { outcome, stage, ...base, ...extra, ms: Date.now() - t0 });
    if (env('TURNSTILE_DISABLED') === 'true') { note('skipped', 'disabled_by_setting'); return true; }
    if (!secret) { log('config', { problem: 'TURNSTILE_SECRET missing - rejecting orders' }); note('failure', 'secret_missing'); return false; }
    if (!base.tokenPresent) { note('failure', 'token_missing'); return false; }
    if (token.length > 2048) { note('failure', 'token_too_long'); return false; }
    let r;
    try {
      const form = new URLSearchParams({ secret, response: token }); if (ip) form.set('remoteip', ip);
      r = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    } catch (e) { note('failure', 'siteverify_unreachable', { error: tag(e && e.name) || 'error' }); return false; }
    let j = null; try { j = await r.json(); } catch { j = null; }
    const info = { httpStatus: r.status, cfSuccess: !!(j && j.success === true),
      errorCodes: Array.isArray(j && j['error-codes']) ? j['error-codes'].slice(0, 10).map(tag) : [],
      cfHostname: j && j.hostname ? String(j.hostname).toLowerCase().slice(0, 100) : null,
      cfChallengeTs: j && j.challenge_ts ? tag(String(j.challenge_ts)) : null, cfAction: j && j.action ? tag(String(j.action)) : null };
    info.hostnameMatchesRequest = info.cfHostname && base.requestHost ? info.cfHostname === base.requestHost : null;
    if (j && j.success === true) { note('success', 'siteverify_success', info); return true; }
    note('failure', j ? 'siteverify_rejected' : (r.ok ? 'siteverify_bad_response' : 'siteverify_http_error'), info);
    return false;
  }

  async function order(req, ctx) {
    if (req.method !== 'POST') return json(405, { ok: false, error: 'method' });
    const ip = clientIp(req, ctx);
    if (!sameOrigin(req)) { log('suspicious', { reason: 'origin', ip, origin: req.headers.get('origin') }); return json(403, { ok: false, error: 'origin' }); }
    let body, raw;
    try { raw = await req.text(); if (raw.length > 12000) throw new Error('big'); body = JSON.parse(raw); } catch { log('suspicious', { reason: 'unreadable body', ip }); return json(400, { ok: false, error: 'invalid', fields: { _: 'Bad request.' } }); }
    const res = validate(body, deps.menu);
    if (!res.ok) { log('rejected', { reason: 'validation', ip, fields: Object.keys(res.fields) }); return json(400, { ok: false, error: 'invalid', fields: res.fields }); }
    const v = res.v;
    if (!(await verifyTurnstile(body.turnstileToken, ip, req, body.clientDiag))) { log('suspicious', { reason: 'turnstile', ip }); return json(403, { ok: false, error: 'turnstile' }); }
    if (v.clientTotal !== v.total) {
      log('rejected', { reason: 'price mismatch', ip, client: v.clientTotal, server: v.total });
      return json(409, { ok: false, error: 'price_changed', total: v.total, menu: deps.menu.items.map(i => ({ id: i.id, price: i.price, available: i.available !== false })) });
    }
    const now = deps.now(); const dd = deliveryDate(now); const note = feeNote(v.zone, v.total);
    const itemsOut = v.items.map(i => ({ id: i.id, name: i.n, qty: i.q, price: i.p, line: i.q * i.p, group: i.g }));
    const payload = { action: 'create', requestId: v.requestId, items: v.items.map(i => ({ n: i.n, q: i.q, p: i.p, g: i.g })), total: v.total, delivery: note, deliveryDate: dd.ymd, zone: v.zone };
    let out = null, hard = false;
    try { out = await callScript(payload); } catch (e) { log('script_unreachable', { err: String(e && e.message) }); }
    if (out && out.ok === true && ID_RE.test(String(out.id))) {
      return json(200, { ok: true, status: 'registered', orderId: out.id, createdAt: out.createdIst, deliveryDate: dd.label, total: v.total, deliveryNote: note, items: itemsOut, repeat: !!out.repeat });
    }
    if (out && out.ok === false && !['busy', 'server'].includes(out.error)) { hard = true; log('script_rejected', { error: out.error }); }
    if (hard) return json(502, { ok: false, error: 'service', prRef: await prRefFor(v.requestId) });
    const prRef = await prRefFor(v.requestId);
    try {
      const store = await deps.store();
      await store.set('req_' + v.requestId, JSON.stringify({ ...payload, prRef, queuedAt: now.toISOString() }), { onlyIfNew: true });
      log('queued', { prRef });
      return json(202, { ok: true, status: 'pending', prRef, createdAt: istString(now), deliveryDate: dd.label, total: v.total, deliveryNote: note, items: itemsOut });
    } catch (e) {
      log('queue_failed', { err: String(e && e.message), prRef });
      return json(503, { ok: false, error: 'unavailable', prRef });
    }
  }

  async function handoff(req, ctx) {
    if (req.method !== 'POST') return json(405, { ok: false, error: 'method' });
    if (!sameOrigin(req)) return json(403, { ok: false, error: 'origin' });
    let b; try { b = JSON.parse(await req.text()); } catch { return json(400, { ok: false, error: 'invalid' }); }
    if (!b || !ID_RE.test(String(b.orderId)) || !RID_RE.test(String(b.requestId)) || b.status !== 'Opened') return json(400, { ok: false, error: 'invalid' });
    try {
      const out = await callScript({ action: 'handoff', orderId: b.orderId, requestId: b.requestId, status: 'Opened' });
      return json(200, { ok: !!(out && out.ok) });
    } catch (e) { log('handoff_failed', { err: String(e && e.message) }); return json(200, { ok: false }); }
  }

  // Runs every 10 minutes. Registers orders that could not reach Google earlier.
  async function retryPending() {
    const results = [];
    const store = await deps.store();
    const list = await store.list({ prefix: 'req_' });
    for (const b of (list.blobs || []).slice(0, 25)) {
      const p = await store.get(b.key, { type: 'json' });
      if (!p) continue;
      try {
        const out = await callScript(p);
        if (out && out.ok === true && ID_RE.test(String(out.id))) { await store.delete(b.key); results.push({ key: b.key, id: out.id }); log('registered_from_queue', { prRef: p.prRef, id: out.id }); }
        else if (out && out.ok === false && !['busy', 'server'].includes(out.error)) { log('queue_item_rejected', { key: b.key, error: out.error }); results.push({ key: b.key, error: out.error }); }
        else { results.push({ key: b.key, retry: true }); break; }
      } catch (e) { results.push({ key: b.key, retry: true }); break; }
    }
    return results;
  }

  return { order, handoff, retryPending };
}
