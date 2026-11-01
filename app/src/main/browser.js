// The web browser: one window, one box to type in, and no way for the open web to reach the
// service or the audience screen.
//
// Churches look things up mid-week — a reading plan, a notice, a photograph for a backdrop —
// and alt-tabbing to Chrome on a projector-connected laptop is how a desktop ends up on the
// wall. This keeps that inside RG-Present, on the operator's own screen.
//
// Three rules it keeps:
//   1. It opens on the screen the operator is sitting at, never the projector's.
//   2. The page runs sandboxed in a session of its own, with no preload, so it cannot see
//      `window.rg` and cannot touch the library, the service or the output.
//   3. Nothing downloads itself onto a church computer. The one thing that can come out of
//      the browser is a picture the operator deliberately saves into the media library.
const { BaseWindow, WebContentsView, Menu, app, net, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { paths } = require('./store');

const CHROME_HEIGHT = 48;
const PARTITION = 'persist:rg-web';

/** DuckDuckGo: no account, no bubble, and a results page that survives a slow line. */
const SEARCH_URL = 'https://duckduckgo.com/?q=';
const SEARCH_HOME = 'https://duckduckgo.com/';

const state = { window: null, chrome: null, page: null };
let onMediaAdded = null;

/** What the operator typed: an address, or something to search for. */
function resolveQuery(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (text === 'localhost' || /^localhost:\d+/.test(text)) return `http://${text}`;
    return SEARCH_URL + encodeURIComponent(text); // file:, javascript:, data: — searched, not opened
  }
  if (!/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text)) return `https://${text}`;
  if (text === 'localhost') return 'http://localhost';
  return SEARCH_URL + encodeURIComponent(text);
}

function browserState() {
  const c = state.page && !state.page.webContents.isDestroyed() ? state.page.webContents : null;
  const nav = c && c.navigationHistory;
  return {
    open: !!(state.window && !state.window.isDestroyed()),
    url: c ? c.getURL() : '',
    title: c ? c.getTitle() : '',
    loading: c ? c.isLoading() : false,
    canGoBack: nav ? nav.canGoBack() : false,
    canGoForward: nav ? nav.canGoForward() : false,
  };
}

function publish() {
  const chrome = state.chrome;
  if (!chrome || chrome.webContents.isDestroyed()) return;
  chrome.webContents.send('web:state', browserState());
}

function layout() {
  const w = state.window;
  if (!w || w.isDestroyed() || !state.chrome || !state.page) return;
  const { width, height } = w.getContentBounds();
  state.chrome.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
  state.page.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
}

/** The work area of whichever screen the operator is actually using. */
function operatorArea(operatorWindow) {
  const display = operatorWindow && !operatorWindow.isDestroyed()
    ? screen.getDisplayMatching(operatorWindow.getBounds())
    : screen.getPrimaryDisplay();
  return display.workArea;
}

function hardenSession(partition) {
  // No camera, no microphone, no location, and above all no notifications popping up
  // during a service.
  partition.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  partition.setPermissionCheckHandler(() => false);
}

/** Our own offline page, rather than Chromium's dinosaur. */
function offlinePage(url, description) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><style>
    :root{color-scheme:dark} body{margin:0;height:100vh;display:grid;place-items:center;
    background:#12141a;color:#e8eaf0;font:15px/1.6 "Segoe UI",system-ui,sans-serif;text-align:center}
    div{max-width:30rem;padding:0 2rem} h1{font-size:19px;margin:0 0 10px}
    p{margin:0 0 6px;color:#9aa4b2} code{color:#7aa2f7;word-break:break-all}
  </style><div><h1>That page could not be opened</h1>
    <p>Everything else in RG-Present works without the internet; the browser is the one part that needs it.</p>
    <p><code>${esc(url)}</code></p><p>${esc(description)}</p></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * Save a picture from the page into the media library, so a backdrop found on the web can be
 * used in tonight's service. This is the only thing that crosses from the browser into the app,
 * and it happens because the operator asked for it by name.
 */
async function savePicture(srcUrl) {
  const clean = String(srcUrl || '').split('?')[0];
  const guessed = path.basename(clean) || 'picture';
  const ext = (path.extname(guessed) || '.jpg').toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
  const safeExt = allowed.includes(ext) ? ext : '.jpg';
  const name = `web-${Date.now()}${safeExt}`;
  const dir = path.join(paths.media, 'user');
  fs.mkdirSync(dir, { recursive: true });

  const response = await net.fetch(srcUrl);
  if (!response.ok) throw new Error(`The picture could not be fetched (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 40 * 1024 * 1024) throw new Error('That picture is too large to keep.');
  fs.writeFileSync(path.join(dir, name), buffer);

  const rel = `user/${name}`;
  if (onMediaAdded) onMediaAdded({ name: path.basename(guessed, path.extname(guessed)) || 'Picture', rel_path: rel, type: 'image' });
  return rel;
}

function guardPage(page, operatorWindow) {
  const c = page.webContents;

  c.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) c.loadURL(url);
    else shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  c.on('will-navigate', (e, url) => {
    if (!/^(https?|about|data):/i.test(url)) e.preventDefault();
  });

  c.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const nav = c.navigationHistory;
    if (input.alt && input.key === 'ArrowLeft' && nav.canGoBack()) nav.goBack();
    else if (input.alt && input.key === 'ArrowRight' && nav.canGoForward()) nav.goForward();
    else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) c.reload();
  });

  // Right-click on a picture: keep it. Right-click on a link: open it, or copy it.
  c.on('context-menu', (_e, params) => {
    const items = [];
    if (params.mediaType === 'image' && params.srcURL) {
      items.push({
        label: 'Save this picture to Media',
        click: () => {
          savePicture(params.srcURL)
            .then(() => { if (operatorWindow && !operatorWindow.isDestroyed()) operatorWindow.webContents.send('content:changed'); })
            .catch((err) => { if (state.chrome && !state.chrome.webContents.isDestroyed()) state.chrome.webContents.send('web:error', String(err.message || err)); });
        },
      });
      items.push({ type: 'separator' });
    }
    if (params.linkURL) {
      items.push({ label: 'Open this link', click: () => c.loadURL(params.linkURL) });
      items.push({ label: 'Copy the link', click: () => require('electron').clipboard.writeText(params.linkURL) });
      items.push({ type: 'separator' });
    }
    if (params.selectionText) {
      items.push({ label: 'Copy', role: 'copy' });
      items.push({ label: `Search for “${params.selectionText.slice(0, 30)}”`, click: () => c.loadURL(SEARCH_URL + encodeURIComponent(params.selectionText)) });
      items.push({ type: 'separator' });
    }
    items.push({ label: 'Back', enabled: c.navigationHistory.canGoBack(), click: () => c.navigationHistory.goBack() });
    items.push({ label: 'Reload', click: () => c.reload() });
    Menu.buildFromTemplate(items).popup({ window: state.window });
  });

  // Nothing installs itself onto a church computer from here.
  c.session.on('will-download', (e) => e.preventDefault());
}

/** Open the browser, optionally straight onto a search or an address. */
function openBrowser(input, operatorWindow) {
  const target = input ? resolveQuery(input) : null;

  if (state.window && !state.window.isDestroyed()) {
    state.window.show();
    state.window.focus();
    if (target) state.page.webContents.loadURL(target);
    return browserState();
  }

  const area = operatorArea(operatorWindow);
  const width = Math.min(1280, Math.max(900, Math.round(area.width * 0.82)));
  const height = Math.min(900, Math.max(600, Math.round(area.height * 0.86)));

  const w = new BaseWindow({
    width, height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    minWidth: 640, minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#12141a',
    title: 'RG-Present — Web',
  });
  state.window = w;

  const partition = session.fromPartition(PARTITION);
  hardenSession(partition);

  const chrome = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  state.chrome = chrome;

  const page = new WebContentsView({
    // No preload, its own session, sandboxed: the open web cannot see the app.
    webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  state.page = page;

  w.contentView.addChildView(chrome);
  w.contentView.addChildView(page);
  layout();
  w.on('resize', layout);

  guardPage(page, operatorWindow);
  for (const event of ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']) {
    page.webContents.on(event, publish);
  }
  page.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: one navigation replacing another
    page.webContents.loadURL(offlinePage(url, description));
  });

  chrome.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'web', 'index.html'));
  page.webContents.loadURL(target || SEARCH_HOME);

  w.on('closed', () => { state.window = null; state.chrome = null; state.page = null; });
  w.show();
  return browserState();
}

function closeBrowser() {
  if (state.window && !state.window.isDestroyed()) state.window.close();
}

function navigate(input) {
  const url = resolveQuery(input);
  if (url && state.page) state.page.webContents.loadURL(url);
  return browserState();
}

function back() {
  const nav = state.page && state.page.webContents.navigationHistory;
  if (nav && nav.canGoBack()) nav.goBack();
  return browserState();
}

function forward() {
  const nav = state.page && state.page.webContents.navigationHistory;
  if (nav && nav.canGoForward()) nav.goForward();
  return browserState();
}

function reload() {
  if (state.page) state.page.webContents.reload();
  return browserState();
}

/** Tell the browser how to put a saved picture into the library. */
function onPictureSaved(fn) { onMediaAdded = fn; }

app.once('before-quit', closeBrowser);

module.exports = { openBrowser, closeBrowser, navigate, back, forward, reload, browserState, resolveQuery, onPictureSaved, SEARCH_HOME, SEARCH_URL };
