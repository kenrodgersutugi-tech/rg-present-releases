const { _electron: electron } = require('/home/user/rg-present/node_modules/playwright')
const { mkdtempSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const KEY = readFileSync('/tmp/claude-0/-home-user/d70d2015-a903-5412-b11b-adb063735429/scratchpad/.k', 'utf8').trim()

;(async () => {
  const proxy = process.env.HTTPS_PROXY.replace(/^http:\/\//, '')
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--proxy-server=${proxy}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rgjs-'))}`],
    env: { ...process.env, RG_USER_DATA: mkdtempSync(join(tmpdir(), 'rgdata-')) }, timeout: 60000
  })
  await app.firstWindow()
  await new Promise((r) => setTimeout(r, 7000))
  const op = app.windows().find((w) => w.url().includes('operator/index.html'))
  await op.waitForLoadState('domcontentloaded')
  await op.evaluate((k) => window.rg.invoke('settings:set', { geminiApiKey: k }), KEY)

  const time = async (label, fn) => {
    const t = Date.now()
    try {
      const r = await fn()
      console.log(`${label} (${((Date.now() - t) / 1000).toFixed(1)}s):`, JSON.stringify(r).slice(0, 420))
      return r
    } catch (e) {
      console.log(`${label} FAILED:`, String(e.message).slice(0, 200))
      return null
    }
  }

  const songs = await time('find songs  ', () =>
    op.evaluate(() => window.rg.invoke('ai:find-songs', { query: 'a hymn about the cross for Good Friday' })))

  // The grounding claim: every suggestion must be a hymn this library actually holds.
  if (songs && songs.length) {
    const check = await op.evaluate(async (ids) => {
      const out = []
      for (const id of ids) { const s = await window.rg.invoke('songs:get', id); out.push(!!s && s.title) }
      return out
    }, songs.map((s) => s.id))
    console.log('   all in the library:', check.every(Boolean), '→', JSON.stringify(check))
  }

  await time('find readings', () =>
    op.evaluate(() => window.rg.invoke('ai:find-readings', { query: 'where does it say train up a child in the way he should go' })))

  await time('notes→slides ', () =>
    op.evaluate(() => window.rg.invoke('ai:notes-to-slides', {
      notes: 'Notices for Sunday 9th. Harambee for the church roof on Saturday from 10am at the hall, bring a friend. Youth meeting Thursday 6pm. Baptism class starts next week, see Pastor John. Offering envelopes are at the back.' })))

  await time('plan service ', () =>
    op.evaluate(() => window.rg.invoke('ai:plan-service', { theme: 'Harvest thanksgiving' })))

  await app.close()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
