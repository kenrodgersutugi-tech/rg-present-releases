/**
 * Licensing, against the shared RG Devs licence service.
 *
 * The same service RG Dev POS and RG HotelOS use (Neon project "rg-dev-pos-licensing", function
 * "licence"), told apart by the product name. A key for another RG Devs product is refused before
 * it can take one of this licence's machine slots.
 *
 * How it works, and why:
 *
 *  - **Activation needs the internet once.** The licence key and a one-way hash of this computer's
 *    identity go to the service, which returns an Ed25519-signed token. Every check after that is
 *    made here, against a public key compiled into the app, so a church with no internet keeps
 *    working for the life of the token. The private key exists only inside the licensing database.
 *
 *  - **Nothing ever interrupts a service.** Checks happen when the operator is idle; the audience
 *    window is never touched by anything in this file. If a licence lapses while a hymn is on the
 *    screen, the hymn stays on the screen. `canGoLive()` is asked before something NEW goes up,
 *    and that is the only thing licensing is allowed to stop.
 *
 *  - **An update never locks a church out.** A copy that was already in use before this build
 *    arrives is given one free grace period (GRACE_DAYS). It is granted once per library and
 *    recorded in the licence file, so it cannot be renewed by reinstalling the app.
 *
 * Everything else in RG-Present — the library, editing, saving, printing, the stage display —
 * works whatever the licence says.
 */
const { app } = require('electron');
const { execFile } = require('node:child_process');
const { createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { paths, writeFileAtomic } = require('./store');

const PRODUCT = 'rg-present';
const SERVICE_URL = process.env.RG_LICENCE_URL || 'https://br-dry-bread-ba49tgr7-licence.compute.c-8.eu-central-1.aws.neon.tech';
/** Verifies tokens; it cannot create them. */
const PUBLIC_KEYS = ['o5MGqjjQquV2UJ02vyNFaCCAQPfNd7iFfQ2H4KPRXU4='];
/** RGPRS-XXXXX-XXXXX-XXXXX-XXXXX (other RG Devs products use their own three letters). */
const KEY_RE = /^RG[A-Z]{3}(-[A-Z0-9]{5}){4}$/;

const DAY = 86_400_000;
/** How long a church that was already using RG-Present before licensing keeps working for free. */
const GRACE_DAYS = 90;
/** A paid licence starts asking to be renewed this long before it runs out. */
const RENEW_WITHIN_DAYS = 30;
const ORDER_KEEP_MS = 2 * DAY;

/**
 * The Microsoft Store copy is licensed in the same way, but it may not take the money itself:
 * Store policy 10.8.1 requires digital goods sold inside a Store app to go through Microsoft's
 * own commerce. So in that build the licence is entered as a key, bought from RG Devs outside the
 * app; the installer from the website is the one that can pay with M-Pesa on the spot.
 */
const isStoreBuild = () => !!process.windowsStore;

const FILE = () => path.join(paths.data, 'licence.json');
const ORDERS = () => path.join(paths.data, 'licence-orders.json');

let log = () => {};
let timers = [];
/** Set by main.js: licensing must never act while something is on the audience screen. */
let isLive = () => false;

// ──────────────────────────────────────────────────────────── this computer's identity

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** The fingerprint every RG Devs product uses, so one computer has one identity across them all. */
const fingerprintOf = (guid, disk) => sha(`rgpos-fp-v1|${guid}|${disk}`);
const partHash = (part) => sha(`rgpos-part-v1|${part}`);

const runCommand = (cmd, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });

let identity = { guid: '', disk: '', fingerprint: null };
let identityComplete = null;
let identityReading = null;

async function readIdentityNow() {
  if (process.platform !== 'win32') {
    // Development machines; the shipped app is Windows only.
    const id = { guid: 'fallback', disk: os.hostname(), fingerprint: sha(`rgpos-fp-v1|fallback|${os.hostname()}|${(os.cpus()[0] || {}).model || ''}`) };
    identityComplete = identity = id;
    return id;
  }
  let { guid, disk } = identity;
  // Windows is often still starting when RG-Present opens, and PowerShell can take many seconds or
  // fail outright. A half-read identity must never become a different fingerprint, or the church is
  // told its licence belongs to another machine — so a partial reading is simply retried.
  for (let i = 0; i < 3 && (!guid || !disk); i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, i === 1 ? 3000 : 10000));
    if (!guid) {
      const out = await runCommand('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], 15000);
      guid = (/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(out) || [])[1];
      guid = guid ? guid.toLowerCase() : '';
    }
    if (!disk) {
      const out = await runCommand(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', "(Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Get-Disk).SerialNumber"],
        60000,
      );
      disk = out.trim().replace(/\.$/, '').toUpperCase();
    }
    identity = { guid, disk, fingerprint: null };
  }
  if (guid && disk) {
    identityComplete = identity = { guid, disk, fingerprint: fingerprintOf(guid, disk) };
    log('licence: this computer’s id was read');
  } else {
    log(`licence: could not read this computer’s id yet (registry ${guid ? 'ok' : 'unavailable'}, disk ${disk ? 'ok' : 'unavailable'})`);
  }
  return identity;
}

function readIdentity(fresh = false) {
  if (fresh) {
    identityComplete = null;
    if (!identityReading) identity = { guid: '', disk: '', fingerprint: null };
  }
  if (identityComplete) return Promise.resolve(identityComplete);
  if (!identityReading) identityReading = readIdentityNow().finally(() => { identityReading = null; });
  return identityReading;
}

// ──────────────────────────────────────────────────────────── the token

const keyObjects = PUBLIC_KEYS.map((raw) =>
  createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw, 'base64').toString('base64url') }, format: 'jwk' }),
);

/** Signature only. Says nothing about product, expiry or which machine. */
function verifyToken(token) {
  const [payload, sig, extra] = String(token || '').split('.');
  if (!payload || !sig || extra !== undefined) return null;
  try {
    if (!keyObjects.some((k) => verify(null, Buffer.from(payload), k, Buffer.from(sig, 'base64url')))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && claims.v === 1 && typeof claims.exp === 'number' && typeof claims.fp === 'string' ? claims : null;
  } catch (_) {
    return null;
  }
}

// ──────────────────────────────────────────────────────────── what is on disk

function readStored() {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch (_) { return null; }
}

function writeStored(s) {
  writeFileAtomic(FILE(), JSON.stringify(s, null, 2));
}

function readOrders() {
  try {
    const all = JSON.parse(fs.readFileSync(ORDERS(), 'utf8'));
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, o]) => now - o.at < ORDER_KEEP_MS));
  } catch (_) {
    return {};
  }
}

const writeOrders = (orders) => writeFileAtomic(ORDERS(), JSON.stringify(orders));

/**
 * Was there a library here before this build opened one?
 *
 * It has to be asked BEFORE the database is opened, because opening it creates the file: main.js
 * calls this as its first act, ahead of db.open(). The answer is what separates a church that was
 * already using RG-Present (free, it gets the grace) from a fresh install (no grace).
 */
let libraryExisted = null;

function observeInstall() {
  if (libraryExisted === null) {
    try { libraryExisted = fs.existsSync(paths.db); } catch (_) { libraryExisted = false; }
  }
  return libraryExisted;
}

/**
 * The grace a church gets for already having been here. Granted once, the first time a licensed
 * build opens a library that predates it; kept in the licence file, so reinstalling RG-Present does
 * not hand out another one.
 */
function graceRecord() {
  const stored = readStored() || {};
  if (stored.grace) return stored.grace;
  const existing = observeInstall();
  const grace = existing
    ? { granted: new Date().toISOString(), until: new Date(Date.now() + GRACE_DAYS * DAY).toISOString(), reason: 'upgrade' }
    : { granted: new Date().toISOString(), until: null, reason: 'new-install' };
  writeStored({ ...stored, grace });
  if (existing) log(`licence: this library was already in use, so it keeps working free until ${grace.until.slice(0, 10)}`);
  return grace;
}

// ──────────────────────────────────────────────────────────── status

function matchMachine(stored, claimsFp, id) {
  if (id.fingerprint) return id.fingerprint === claimsFp ? 'same' : 'other';
  let matched = false;
  for (const [part, hash] of [[id.guid, stored.guidHash], [id.disk, stored.diskHash]]) {
    if (!part || !hash) continue;
    if (partHash(part) !== hash) return 'other';
    matched = true;
  }
  return matched ? 'degraded' : 'unknown';
}

/**
 * What this copy is entitled to, worked out entirely on this computer.
 *
 * States: valid · renewal_due · trial · grace · expired · trial_ended · unlicensed · checking.
 * Only the last four stop anything, and only `canGoLive` acts on them.
 */
async function status(now = Date.now()) {
  const grace = graceRecord();
  const stored = readStored();
  const snapshot = identityComplete || identity;
  const base = { product: PRODUCT, machineCode: snapshot.fingerprint || null, storeBuild: isStoreBuild() };

  const graceLeft = grace && grace.until ? Date.parse(grace.until) - now : -1;
  const inGrace = graceLeft > 0;

  if (!stored || !stored.token) {
    return inGrace
      ? { ...base, state: 'grace', graceUntil: grace.until, graceDaysLeft: Math.ceil(graceLeft / DAY) }
      : { ...base, state: 'unlicensed', reason: 'none' };
  }

  const claims = verifyToken(stored.token);
  if (!claims) return { ...base, state: inGrace ? 'grace' : 'unlicensed', reason: 'invalid', graceUntil: grace.until };
  if (claims.product !== PRODUCT) {
    return { ...base, state: inGrace ? 'grace' : 'unlicensed', reason: 'wrong_product', business: claims.business, graceUntil: grace.until };
  }

  const id = await readIdentity();
  const match = matchMachine(stored, claims.fp, id);
  if (match === 'other') {
    return { ...base, state: inGrace ? 'grace' : 'unlicensed', reason: 'other_machine', business: claims.business, machineCode: id.fingerprint, graceUntil: grace.until };
  }
  if (match === 'unknown') return { ...base, state: 'checking', business: claims.business, machineCode: null };
  if (match === 'same' && (!stored.guidHash || !stored.diskHash)) {
    writeStored({ ...stored, guidHash: partHash(id.guid), diskHash: partHash(id.disk) });
  }

  const trial = claims.plan === 'trial';
  // A paid plan's real end is the day it was paid up to; the token's own expiry is the offline
  // ceiling, which the service sets further out so a church with no internet is not cut off.
  const paidEnd = claims.paidUntil ? Date.parse(`${claims.paidUntil}T23:59:59`) : null;
  const tokenEnd = claims.exp * 1000;
  const end = trial ? tokenEnd : Math.min(paidEnd || tokenEnd, tokenEnd);
  const over = now >= end;
  const state = over ? (trial ? 'trial_ended' : 'expired') : trial ? 'trial' : end - now < RENEW_WITHIN_DAYS * DAY ? 'renewal_due' : 'valid';

  return {
    ...base,
    state,
    business: claims.business,
    plan: claims.plan,
    keyHint: String(stored.key || '').slice(-5),
    expiresAt: new Date(end).toISOString(),
    paidUntil: claims.paidUntil || null,
    daysLeft: Math.max(0, Math.ceil((end - now) / DAY)),
    lastRenewalAttemptAt: stored.lastRenewalAttemptAt || null,
    lastRenewalError: stored.lastRenewalError || null,
    machineCode: id.fingerprint || snapshot.fingerprint || null,
    ...(match === 'degraded' ? { degraded: true } : {}),
    ...(inGrace ? { graceUntil: grace.until } : {}),
  };
}

const BLOCKING = new Set(['unlicensed', 'expired', 'trial_ended']);

/**
 * May something NEW go on the audience screen? Anything already live stays live whatever this says
 * — the caller checks this before putting a slide up, never while one is showing.
 */
async function canGoLive() {
  const st = await status();
  return { allowed: !BLOCKING.has(st.state), status: st };
}

// ──────────────────────────────────────────────────────────── talking to the service

async function service(pathname, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init && init.method === 'POST' ? 40000 : 20000);
  try {
    const res = await fetch(`${SERVICE_URL}${pathname}`, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (_) {
    const e = new Error('Could not reach the RG Devs licence service. Connect this computer to the internet — a phone hotspot is enough — and try again.');
    e.code = 'offline';
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function refused(body, fallback) {
  const e = new Error((body && body.message) || fallback);
  e.code = (body && body.error) || 'refused';
  return e;
}

/** One activation or trial request: the key, this computer's hashed id, its name, and the version. */
async function call(endpoint, extra) {
  const id = await readIdentity();
  if (!id.fingerprint) {
    const e = new Error("This computer's id could not be read yet. Windows may still be starting: wait a minute and try again.");
    e.code = 'machine_id';
    throw e;
  }
  const { status: code, body } = await service(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...extra, fingerprint: id.fingerprint, product: PRODUCT, machineName: os.hostname(), appVersion: app.getVersion() }),
  });
  if (code !== 200 || !body.token) throw refused(body, 'The licence service refused this key.');
  const claims = verifyToken(body.token);
  if (!claims || claims.fp !== id.fingerprint) {
    const e = new Error('The licence service returned a licence this computer cannot use.');
    e.code = 'bad_token';
    throw e;
  }
  if (claims.product !== PRODUCT) {
    const e = new Error('That key is for another RG Devs product, not RG-Present.');
    e.code = 'wrong_product';
    throw e;
  }
  return { token: body.token, claims, id, licenceKey: body.licenceKey };
}

async function activate(licenceKey) {
  const key = String(licenceKey || '').trim().toUpperCase();
  if (!KEY_RE.test(key)) {
    const e = new Error('A licence key looks like RGPRS-XXXXX-XXXXX-XXXXX-XXXXX.');
    e.code = 'bad_key';
    throw e;
  }
  const r = await call('/activate', { licenceKey: key });
  writeStored({
    ...(readStored() || {}),
    key, token: r.token,
    lastRenewalAttemptAt: new Date().toISOString(), lastRenewalError: null,
    guidHash: partHash(r.id.guid), diskHash: partHash(r.id.disk),
  });
  log('licence: activated');
  return status();
}

async function startTrial() {
  let r;
  try {
    r = await call('/trial', {});
  } catch (e) {
    // The shared service tells POS shops to contact RG Devs; a church can buy a plan here and now.
    if (e.code === 'trial_used') {
      const better = new Error('This computer has already had its free trial. Choose a plan below — the licence turns on by itself once the payment goes through.');
      better.code = 'trial_used';
      throw better;
    }
    throw e;
  }
  const key = String(r.licenceKey || '').trim().toUpperCase();
  if (!KEY_RE.test(key) || r.claims.plan !== 'trial') {
    const e = new Error('The licence service returned a trial this computer cannot use.');
    e.code = 'bad_token';
    throw e;
  }
  writeStored({
    ...(readStored() || {}),
    key, token: r.token,
    lastRenewalAttemptAt: new Date().toISOString(), lastRenewalError: null,
    guidHash: partHash(r.id.guid), diskHash: partHash(r.id.disk),
  });
  log('licence: free trial started');
  return status();
}

async function prices() {
  // Showing what a plan costs is fine in any build; only taking the money inside a Store copy is not.
  const { status: code, body } = await service(`/prices?product=${PRODUCT}`);
  if (code !== 200 || !Array.isArray(body.plans)) return { available: false, plans: [] };
  return { available: body.available === true, plans: body.plans };
}

/** Starts an M-Pesa payment: the phone is prompted on the till, and the licence follows the money. */
async function buy({ priceCode, phone, churchName }) {
  if (isStoreBuild()) {
    const e = new Error('This copy came from the Microsoft Store, which does not allow paying inside the app. Ask RG Devs for a licence key.');
    e.code = 'store_build';
    throw e;
  }
  const id = await readIdentity();
  if (!id.fingerprint) {
    const e = new Error("This computer's id could not be read yet. Windows may still be starting: wait a minute and try again.");
    e.code = 'machine_id';
    throw e;
  }
  const { status: code, body } = await service('/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fingerprint: id.fingerprint, product: PRODUCT, machineName: os.hostname(), appVersion: app.getVersion(),
      businessName: String(churchName || '').slice(0, 120), priceCode, phone,
    }),
  });
  if (code !== 200 || !body.orderId || !body.pollSecret) throw refused(body, 'The payment request could not be sent. Please try again.');
  writeOrders({ ...readOrders(), [body.orderId]: { secret: body.pollSecret, at: Date.now() } });
  log(`licence: payment request sent (${body.label || priceCode})`);
  return { orderId: body.orderId, amountKes: Number(body.amountKes), label: String(body.label || '') };
}

/** Has that payment gone through? Collects the licence as soon as it has. */
async function buyStatus(orderId) {
  const order = readOrders()[orderId];
  if (!order) {
    const e = new Error('This payment is not one this computer started.');
    e.code = 'not_found';
    throw e;
  }
  const { status: code, body } = await service(`/buy/${encodeURIComponent(orderId)}?s=${encodeURIComponent(order.secret)}`);
  if (code !== 200) {
    const e = new Error('The payment could not be checked just now. RG-Present keeps checking by itself.');
    e.code = 'poll_failed';
    throw e;
  }
  const forget = () => {
    const all = readOrders();
    delete all[orderId];
    writeOrders(all);
  };
  const st = String(body.status);
  if (st !== 'paid') {
    if (st === 'failed' || st === 'cancelled') forget();
    return { status: st, message: typeof body.message === 'string' ? body.message : undefined };
  }
  const key = typeof body.licenceKey === 'string' ? body.licenceKey : null;
  const stored = readStored();
  if (key && (!stored || stored.key !== key)) await activate(key);
  else await renewIfDue(true);
  forget();
  log('licence: paid for in the app');
  return { status: 'paid', receipt: body.receipt || null, licence: await status() };
}

/** Quietly brings the token up to date. Never throws, and never while a service is on the screen. */
async function renewIfDue(force = false) {
  const stored = readStored();
  if (!stored || !stored.token) return;
  if (!force && isLive()) return;
  const st = await status();
  if (st.state === 'unlicensed' || st.state === 'checking') return;
  if (!force && st.state === 'valid') return;
  const attemptAt = new Date().toISOString();
  try {
    const r = await call('/activate', { licenceKey: stored.key });
    writeStored({ ...stored, token: r.token, lastRenewalAttemptAt: attemptAt, lastRenewalError: null, guidHash: partHash(r.id.guid), diskHash: partHash(r.id.disk) });
    log('licence: renewed');
  } catch (e) {
    const offline = e.code === 'offline' || e.code === 'machine_id';
    writeStored({ ...stored, lastRenewalAttemptAt: attemptAt, lastRenewalError: offline ? stored.lastRenewalError || null : e.message });
    log(`licence: renewal ${offline ? 'skipped (offline)' : `refused: ${e.message}`}`);
  }
}

/** Collects the licence for a payment made earlier, even if the dialog was closed in between. */
async function checkPendingOrders() {
  for (const id of Object.keys(readOrders())) {
    try { await buyStatus(id); } catch (_) { /* offline, or not settled yet: tried again later */ }
  }
}

function start(options = {}) {
  log = options.log || log;
  isLive = options.isLive || isLive;
  graceRecord();
  void readIdentity();
  // Nothing here is urgent, and none of it may land in the middle of a service.
  const every = (ms, fn) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); timers.push(t); };
  const once = (ms, fn) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); timers.push(t); };
  once(30000, () => void renewIfDue());
  every(60000, () => { if (!isLive()) void checkPendingOrders(); });
  every(6 * 3600000, () => void renewIfDue());
}

function stop() {
  for (const t of timers) { clearInterval(t); clearTimeout(t); }
  timers = [];
}

module.exports = {
  PRODUCT, SERVICE_URL, KEY_RE, GRACE_DAYS, observeInstall, isStoreBuild,
  status, canGoLive, activate, startTrial, prices, buy, buyStatus,
  renewIfDue, checkPendingOrders, start, stop,
  readIdentity, verifyToken, fingerprintOf,
};
