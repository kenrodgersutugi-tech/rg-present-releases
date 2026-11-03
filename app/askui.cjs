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

  // Open it the way an operator would.
  await op.click('[data-action="ask"]')
  await op.waitForTimeout(800)
  console.log('dialog open :', await op.locator('#askBox').count() > 0)
  console.log('questions   :', JSON.stringify(await op.locator('.ask-actions .btn').allTextContents()))

  await op.fill('#askBox', 'a hymn about the cross for Good Friday')
  await op.click('[data-ask="songs"]')
  await op.waitForTimeout(12000)
  const rows = await op.locator('.ask-row').count()
  console.log('hymns found :', rows)
  console.log('first row   :', (await op.locator('.ask-row').first().textContent()).replace(/\s+/g, ' ').slice(0, 110))
  await op.screenshot({ path: '/home/user/shots/ask-songs.png' })

  // Add the first one and check it really lands in the service.
  await op.locator('.ask-row').first().locator('button:has-text("Add to service")').click()
  await op.waitForTimeout(900)
  console.log('in service  :', JSON.stringify(await op.evaluate(() => window.App.service.items.map((i) => i.title))))

  // Now a reading, resolved in the church's own Bible.
  await op.fill('#askBox', 'where does it say train up a child')
  await op.click('[data-ask="readings"]')
  await op.waitForTimeout(12000)
  console.log('readings    :', (await op.locator('.ask-row').first().textContent()).replace(/\s+/g, ' ').slice(0, 90))
  await op.locator('.ask-row').first().locator('button:has-text("Preview")').click()
  await op.waitForTimeout(1500)
  const onScreen = await op.evaluate(() => {
    const t = document.querySelector('#previewMonitor .rg-text')
    return { title: document.getElementById('previewTitle').textContent, words: t && t.textContent.slice(0, 90) }
  })
  console.log('previewing  :', JSON.stringify(onScreen))
  await op.screenshot({ path: '/home/user/shots/ask-readings.png' })
  await app.close()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
