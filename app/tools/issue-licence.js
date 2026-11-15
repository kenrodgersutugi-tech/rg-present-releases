#!/usr/bin/env node
/**
 * Issues RG-Present licences by hand, for when M-Pesa will not go through — or when the church's
 * computer has no internet at all and cannot even reach the licence service.
 *
 *   export DATABASE_URL='postgres://...@...neon.tech/neondb?sslmode=require'   # licensing project
 *
 *   node tools/issue-licence.js key    --church "St Paul's, Meru" --days 365
 *   node tools/issue-licence.js key    --church "St Paul's, Meru" --lifetime
 *   node tools/issue-licence.js offline --fingerprint <64 hex from the church> --days 120 \
 *                                       --church "St Paul's, Meru"
 *   node tools/issue-licence.js who    --church "St Paul"        # what this church has
 *   node tools/issue-licence.js free   --hint V7G7R              # free the machine slot
 *
 * `key` prints a licence key (RGPRS-…) the church types into Settings → Licence. It needs the
 * church's computer to reach the internet once, to swap the key for a signed licence.
 *
 * `offline` prints the signed licence itself, made for ONE computer — the church pastes it into
 * "M-Pesa not working, or no internet?" and never needs a connection at all. The church reads its
 * computer code off that same screen.
 *
 * The signing key is read from the database into memory for the moment it takes to sign, and is
 * never written anywhere. Keep DATABASE_URL out of scripts, shell history and screenshots: anyone
 * holding it can mint licences for every RG Devs product.
 */
const { createPrivateKey, sign } = require('node:crypto');
const { Client } = require('pg');

const PRODUCT = 'rg-present';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const die = (m) => { console.error(`\n  ${m}\n`); process.exit(1); };

/** The licence the app verifies: base64url(claims).base64url(Ed25519 signature). */
function signClaims(claims, pkcs8B64) {
  const key = createPrivateKey({ key: Buffer.from(pkcs8B64, 'base64'), format: 'der', type: 'pkcs8' });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), key).toString('base64url')}`;
}

async function main() {
  const command = process.argv[2];
  if (!command || ['-h', '--help', 'help'].includes(command)) die(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].split('\n').slice(2).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  if (!process.env.DATABASE_URL) die('Set DATABASE_URL to the licensing project first.');

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    if (command === 'who') {
      const like = `%${arg('church') || ''}%`;
      const { rows } = await db.query(
        `select business, key_hint, plan, status, paid_until, machines_used, max_machines, last_seen_at
           from licence_admin_list where product = $1 and business ilike $2
          order by last_seen_at desc nulls last limit 25`, [PRODUCT, like]);
      if (!rows.length) return console.log('\n  Nothing matches that.\n');
      for (const r of rows) {
        console.log(`\n  ${r.business}\n    key …${r.key_hint}  ${r.plan}  ${r.status}` +
          `\n    paid to ${r.paid_until ? String(r.paid_until).slice(0, 10) : 'no end date'}` +
          `  ·  ${r.machines_used}/${r.max_machines} machines` +
          `  ·  last seen ${r.last_seen_at ? String(r.last_seen_at).slice(0, 16).replace('T', ' ') : 'never'}`);
      }
      return console.log('');
    }

    if (command === 'free') {
      const hint = arg('hint');
      if (!hint) die('Which licence? --hint V7G7R (the last five characters of the key).');
      const { rows } = await db.query(
        `select a.id, a.machine_name, a.app_version, a.last_seen_at
           from machine_activations a join licence_keys k on k.id = a.licence_key_id
          where k.product = $1 and k.key_hint = $2 and a.status = 'active'`, [PRODUCT, String(hint).toUpperCase()]);
      if (!rows.length) return console.log('\n  That licence has no computer on it, so there is nothing to free.\n');
      for (const r of rows) {
        await db.query('select admin_release_machine($1)', [r.id]);
        console.log(`\n  Freed: ${r.machine_name || 'unnamed computer'} (RG-Present ${r.app_version || '?'}, last seen ${String(r.last_seen_at).slice(0, 10)})`);
      }
      return console.log('\n  The same key can now be used on the new computer.\n');
    }

    const church = arg('church');
    if (!church || church === true) die('Which church? --church "St Paul\'s, Meru"');
    const lifetime = arg('lifetime', false) === true;
    const days = lifetime ? null : Number(arg('days', 365));
    if (!lifetime && (!Number.isFinite(days) || days < 1 || days > 4000)) die('--days must be between 1 and 4000, or pass --lifetime.');

    // One business per church, reused if it is already known.
    const found = await db.query('select id from businesses where name = $1 order by created_at limit 1', [church]);
    const businessId = found.rows.length
      ? found.rows[0].id
      : (await db.query('insert into businesses (name, notes) values ($1, $2) returning id', [church, 'Issued by hand (M-Pesa fallback)'])).rows[0].id;

    if (command === 'key') {
      const { rows } = await db.query(
        'select admin_issue_licence($1, $2, $3, $4, $5, $6) as key',
        [businessId, 'standard', Number(arg('machines', 1)), lifetime ? null : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), 120, PRODUCT]);
      console.log(`\n  ${church}\n\n    ${rows[0].key}\n`);
      console.log(`  ${lifetime ? 'No end date (lifetime).' : `Paid for ${days} days.`}`);
      return console.log('  Send that to the church: Settings → Licence → Use this key.\n  It is shown once; only its hash is kept.\n');
    }

    if (command === 'offline') {
      const fp = String(arg('fingerprint') || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(fp)) die('--fingerprint must be the 64-character computer code from the church\'s licence screen.');
      const until = lifetime ? null : new Date(Date.now() + days * 86400000);

      // Recorded like any other licence, so the church shows up in `who` and can be looked after.
      const issued = await db.query(
        'select admin_issue_licence($1, $2, $3, $4, $5, $6) as key',
        [businessId, 'standard', 1, until ? until.toISOString().slice(0, 10) : null, lifetime ? 4000 : days, PRODUCT]);
      const key = issued.rows[0].key;
      const row = await db.query(
        `select k.id, k.plan, k.paid_until, b.id as bid, b.name
           from licence_keys k join businesses b on b.id = k.business_id
          where k.key_hash = encode(extensions.digest($1, 'sha256'), 'hex')`, [key]);
      const k = row.rows[0];
      await db.query(
        `insert into machine_activations (licence_key_id, fingerprint, machine_name, app_version)
         values ($1, $2, $3, $4) on conflict (licence_key_id, fingerprint) do nothing`,
        [k.id, fp, 'offline licence', 'issued by hand']);
      await db.query(
        `insert into licence_events (licence_key_id, event, detail) values ($1, 'offline_issued', $2)`,
        [k.id, JSON.stringify({ fp: fp.slice(0, 12), days: lifetime ? 'lifetime' : days, product: PRODUCT })]);

      const secret = await db.query('select private_pkcs8_b64 from licensing_private.signing_keys order by id desc limit 1');
      if (!secret.rows.length) die('No signing key in the database.');
      const seconds = lifetime ? 4000 * 86400 : days * 86400;
      const token = signClaims({
        v: 1, lid: k.id, bid: k.bid, business: k.name, plan: k.plan, fp,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + seconds,
        paidUntil: k.paid_until ? String(k.paid_until).slice(0, 10) : null,
        product: PRODUCT,
      }, secret.rows[0].private_pkcs8_b64);

      console.log(`\n  ${church} — a licence for that one computer, good for ${lifetime ? 'the lifetime of the product' : `${days} days`}.`);
      console.log('  Send the church everything between the lines. They paste it into the licence box,');
      console.log('  under "M-Pesa not working, or no internet?". No connection is needed at either end.\n');
      console.log('  ----------------------------------------------------------------------------');
      console.log(token);
      console.log('  ----------------------------------------------------------------------------\n');
      console.log(`  Their key, if they ever get online and want it renewed the usual way: ${key}\n`);
      return;
    }

    die(`Unknown command "${command}". Try: key · offline · who · free`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exit(1); });
