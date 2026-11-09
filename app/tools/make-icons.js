#!/usr/bin/env node
/*
 * Renders build/icon.svg into the icons the installer and windows need:
 *   build/icon.ico   (16-256px, PNG-compressed entries — Windows Vista and later)
 *   build/icon.png   (512px, used by electron-builder and the About box)
 *   build/appx/*.png (the tiles the Microsoft Store and the Start menu show)
 *
 *   npx electron tools/make-icons.js
 *
 * Electron does the rendering, so there is no image toolchain to install.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

let win = null;

/**
 * The tiles a Store package has to carry.
 *
 * Windows draws these at several sizes in several places — the Start menu, the task bar, the
 * Store listing — and electron-builder falls back to its own Electron logo for any that are
 * missing, which would put somebody else's mark on a church's Start menu. They are generated
 * from the same icon.svg as everything else, so there is one drawing to maintain.
 *
 * A tile is not a square icon: it is a canvas with the mark centred in it, so the logo keeps
 * its proportions however wide the tile is.
 */
const APPX_TILES = [
  { name: 'Square44x44Logo', w: 44, h: 44 },
  { name: 'Square150x150Logo', w: 150, h: 150 },
  { name: 'Square310x310Logo', w: 310, h: 310 },
  { name: 'Wide310x150Logo', w: 310, h: 150 },
  { name: 'StoreLogo', w: 50, h: 50 },
  { name: 'SplashScreen', w: 620, h: 300 },
  // The scaled variants Windows looks for first; without them it stretches the base tile.
  { name: 'Square44x44Logo.targetsize-24_altform-unplated', w: 24, h: 24 },
  { name: 'Square44x44Logo.targetsize-48_altform-unplated', w: 48, h: 48 },
  { name: 'Square44x44Logo.targetsize-256_altform-unplated', w: 256, h: 256 },
  { name: 'Square150x150Logo.scale-200', w: 300, h: 300 },
  { name: 'Square44x44Logo.scale-200', w: 88, h: 88 },
  { name: 'Wide310x150Logo.scale-200', w: 620, h: 300 },
  { name: 'StoreLogo.scale-200', w: 100, h: 100 },
  { name: 'SplashScreen.scale-200', w: 1240, h: 600 },
];

/**
 * Electron's offscreen capture occasionally never returns on a CI runner with no GPU — twice it
 * has hung a Store build until the job's 45-minute timeout killed it. Nothing here is worth
 * waiting minutes for, so every capture is raced against a clock and retried once on a fresh
 * window; a second failure stops the build in seconds instead of three quarters of an hour.
 */
function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function capture(what, run) {
  try {
    return await withTimeout(run(), 20000, what);
  } catch (e) {
    console.warn(`${what}: ${e.message} — retrying on a new window`);
    if (win) { try { win.destroy(); } catch (_) { /* already gone */ } win = null; }
    return withTimeout(run(), 20000, `${what} (retry)`);
  }
}

/** One tile: the mark centred on a transparent canvas of the tile's own shape. */
async function tile(svg, w, h) {
  if (!win) {
    win = new BrowserWindow({
      width: w, height: h, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', useContentSize: true, webPreferences: { offscreen: true },
    });
  }
  win.setContentSize(w, h);
  // 70% of the shorter side, which is the padding Windows' own tiles use.
  const side = Math.round(Math.min(w, h) * 0.7);
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden;
      width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center}
    svg{display:block;width:${side}px;height:${side}px}</style>${svg}`;
  const tmp = path.join(app.getPath('temp'), `rg-tile-${w}x${h}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 200));
  const img = await win.webContents.capturePage();
  fs.rmSync(tmp, { force: true });
  return img.toPNG();
}

async function shot(svg, size) {
  // One window, resized per icon: creating a fresh offscreen window per size fails after the first.
  if (!win) {
    win = new BrowserWindow({
      width: size, height: size, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', useContentSize: true, webPreferences: { offscreen: true },
    });
  }
  win.setContentSize(size, size);
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  // A file is used rather than a data: URL — long data URLs fail to load.
  const tmp = path.join(app.getPath('temp'), `rg-icon-${size}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 200));
  const img = await win.webContents.capturePage();
  fs.rmSync(tmp, { force: true });
  return img.toPNG();
}

/** ICO directory + PNG-compressed entries. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o); // 0 means 256
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(BUILD, 'icon.svg'), 'utf8');
  const entries = [];
  for (const size of SIZES) entries.push({ size, png: await capture(`icon ${size}px`, () => shot(svg, size)) });
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildIco(entries));
  fs.writeFileSync(path.join(BUILD, 'icon.png'), await capture('icon 512px', () => shot(svg, 512)));
  console.log(`build/icon.ico (${SIZES.join(', ')}px) and build/icon.png written`);

  // The tiles are committed brand assets, not build output: the repository keeps them so a Store
  // build can never quietly ship somebody else's logo. Redrawing fourteen of them on every run is
  // fourteen more chances to hang for no gain, so an existing tile is left alone. Pass
  // RG_REDRAW_TILES=1 after changing icon.svg, and commit what it draws.
  const appx = path.join(BUILD, 'appx');
  fs.mkdirSync(appx, { recursive: true });
  const redraw = process.env.RG_REDRAW_TILES === '1';
  let drawn = 0;
  let kept = 0;
  for (const t of APPX_TILES) {
    const file = path.join(appx, `${t.name}.png`);
    if (!redraw && fs.existsSync(file) && fs.statSync(file).size > 0) { kept++; continue; }
    fs.writeFileSync(file, await capture(`tile ${t.name}`, () => tile(svg, t.w, t.h)));
    drawn++;
  }
  console.log(`build/appx: ${drawn} tiles drawn, ${kept} already in the repository${redraw ? '' : ' (RG_REDRAW_TILES=1 redraws them)'}`);
  app.exit(0);
}).catch((e) => {
  console.error(`make-icons failed: ${e && e.message ? e.message : e}`);
  app.exit(1);
});
