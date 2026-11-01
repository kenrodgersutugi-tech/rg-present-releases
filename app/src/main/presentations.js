// Presentations: a PowerPoint or a PDF, presented slide by slide on the audience screen.
//
// EasyWorship hands a PowerPoint back to PowerPoint and asks it to drive the screen, which is
// why it needs Office installed and why it breaks when Office updates. We import instead: each
// slide becomes a picture of its own in the church's library, so a deck
//
//   * presents with nothing else installed,
//   * keeps working after the .pptx has gone home on its owner's memory stick,
//   * goes into the service order beside the songs and the readings,
//   * and cannot pop a dialog onto the projector mid-service, because PowerPoint is not running.
//
// Three ways in, best first:
//   1. PDF — rendered page by page by pdf.js in a hidden window. Needs nothing installed and
//      looks exactly like the original, so "Save as PDF" is the advice for a deck that matters.
//   2. PowerPoint, with PowerPoint installed — exported to PNG by PowerPoint itself.
//   3. PowerPoint, with nothing installed — the text and pictures are read straight out of the
//      file (a .pptx is a zip of XML) and laid out by us. Plain, but it works everywhere.
const { BrowserWindow } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { paths } = require('./store');

/**
 * Where a deck's slide pictures live: under the media folder, so the rgmedia:// handler that
 * already serves pictures to the audience window serves these too, with no second door into
 * the file system.
 */
function deckDir(id) {
  return path.join(paths.media, 'presentations', id);
}

/** rgmedia:// URL for a slide picture, so the output window can show it with no file access. */
function slideUrl(id, index) {
  return `presentations/${id}/${String(index).padStart(3, '0')}.png`;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---------------------------------------------------------------- PDF

/**
 * Render a PDF with pdf.js inside a hidden window and write one PNG per page.
 *
 * It runs in a renderer rather than in Node because that is where a canvas lives: no native
 * module to rebuild for every Electron version, and nothing extra to install on a church
 * computer.
 */
async function renderPdf(file, id, onProgress) {
  const dir = deckDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'pdf', 'render.html'));
    const data = fs.readFileSync(file).toString('base64');
    // The renderer hands back one data URL per page; writing them here keeps the renderer
    // free of file access.
    const pages = await win.webContents.executeJavaScript(
      `window.renderPdf(${JSON.stringify(data)}, 1600)`,
      true
    );
    let index = 0;
    for (const dataUrl of pages) {
      const base64 = String(dataUrl).split(',')[1] || '';
      fs.writeFileSync(path.join(dir, `${String(index).padStart(3, '0')}.png`), Buffer.from(base64, 'base64'));
      index += 1;
      if (onProgress) onProgress(index, pages.length);
    }
    return index;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// ---------------------------------------------------------------- PowerPoint, with PowerPoint

/**
 * Ask PowerPoint to export the slides as pictures. Only possible on a machine that has it;
 * anything at all goes wrong and the caller falls back to reading the file ourselves.
 */
function exportWithPowerPoint(file, id) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(0);
    const dir = deckDir(id);
    fs.mkdirSync(dir, { recursive: true });

    // -WindowStyle Hidden: nothing of this appears on a projector.
    const script = `
      $ErrorActionPreference = 'Stop'
      try { $ppt = New-Object -ComObject PowerPoint.Application } catch { exit 2 }
      try {
        $deck = $ppt.Presentations.Open('${file.replace(/'/g, "''")}', $true, $false, $false)
        $deck.Export('${dir.replace(/'/g, "''")}', 'PNG', 1600, 900)
        $deck.Close()
        exit 0
      } catch { exit 3 } finally { $ppt.Quit() }`;

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { timeout: 180000 }, (error) => {
        if (error) return resolve(0);
        // PowerPoint names them Slide1.PNG, Slide2.PNG…; rename into our own order.
        try {
          const exported = fs.readdirSync(dir)
            .filter((f) => /^slide\d+\.png$/i.test(f))
            .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
          exported.forEach((name, index) => {
            fs.renameSync(path.join(dir, name), path.join(dir, `${String(index).padStart(3, '0')}.png`));
          });
          resolve(exported.length);
        } catch (_) {
          resolve(0);
        }
      });
  });
}

// ---------------------------------------------------------------- PowerPoint, on its own

const XML_TEXT = /<a:t>([\s\S]*?)<\/a:t>/g;

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * Read the slides straight out of the .pptx. Each slide gives its lines of text, in order, and
 * the pictures it uses; the first picture becomes the slide's background.
 */
function readPptx(file) {
  const zip = new AdmZip(file);
  const entries = zip.getEntries();

  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => Number(a.entryName.replace(/\D/g, '')) - Number(b.entryName.replace(/\D/g, '')));

  return slideEntries.map((entry) => {
    const xml = entry.getData().toString('utf8');
    const lines = [];
    let match;
    XML_TEXT.lastIndex = 0;
    while ((match = XML_TEXT.exec(xml)) !== null) {
      const text = decodeEntities(match[1]).trim();
      if (text) lines.push(text);
    }

    // The pictures this slide uses, through its relationships file.
    const number = entry.entryName.replace(/\D/g, '');
    const relsEntry = entries.find((e) => e.entryName === `ppt/slides/_rels/slide${number}.xml.rels`);
    const images = [];
    if (relsEntry) {
      const rels = relsEntry.getData().toString('utf8');
      const re = /Target="([^"]+\.(?:png|jpe?g|gif|bmp|webp))"/gi;
      let rel;
      while ((rel = re.exec(rels)) !== null) {
        const name = `ppt/media/${path.basename(rel[1])}`;
        const media = entries.find((e) => e.entryName === name);
        if (media) images.push({ name: path.basename(rel[1]), data: media.getData() });
      }
    }
    return { lines, images };
  });
}

/** Draw the slides we read ourselves, in a hidden window, so every deck ends up as pictures. */
async function drawSlides(slides, id, onProgress) {
  const dir = deckDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false, contextIsolation: false, nodeIntegration: true, webSecurity: false },
  });

  try {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'pdf', 'render.html'));
    const payload = slides.map((slide) => ({
      lines: slide.lines,
      image: slide.images[0] ? `data:image/png;base64,${slide.images[0].data.toString('base64')}` : null,
    }));
    const pages = await win.webContents.executeJavaScript(
      `window.drawSlides(${JSON.stringify(payload)}, 1600, 900)`,
      true
    );
    let index = 0;
    for (const dataUrl of pages) {
      const base64 = String(dataUrl).split(',')[1] || '';
      fs.writeFileSync(path.join(dir, `${String(index).padStart(3, '0')}.png`), Buffer.from(base64, 'base64'));
      index += 1;
      if (onProgress) onProgress(index, pages.length);
    }
    return index;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// ---------------------------------------------------------------- the one way in

/**
 * Import a presentation. Returns what to put in the library, or throws something an operator
 * can act on.
 */
async function importPresentation(file, onProgress) {
  const ext = path.extname(file).toLowerCase();
  const id = newId();
  const name = path.basename(file, ext);
  let slides = 0;
  let kind = 'pptx';

  if (ext === '.pdf') {
    kind = 'pdf';
    slides = await renderPdf(file, id, onProgress);
  } else if (ext === '.pptx' || ext === '.ppt') {
    slides = await exportWithPowerPoint(file, id);
    if (slides > 0) {
      kind = 'pptx-office';
    } else if (ext === '.pptx') {
      const read = readPptx(file);
      if (read.length === 0) throw new Error('There are no slides in that file.');
      slides = await drawSlides(read, id, onProgress);
      kind = 'pptx-text';
    } else {
      throw new Error('An old .ppt needs PowerPoint installed. Save it as .pptx or as a PDF and try again.');
    }
  } else {
    throw new Error('RG-Present can show a PowerPoint (.pptx) or a PDF.');
  }

  if (!slides) throw new Error('Nothing could be read out of that file.');
  return { id, name, source: file, kind, slides };
}

/** The slide pictures of a deck, as rgmedia paths the output window can load. */
function deckSlides(id, count) {
  return Array.from({ length: count }, (_, index) => slideUrl(id, index));
}

function removeDeck(id) {
  fs.rmSync(deckDir(id), { force: true, recursive: true });
}

module.exports = { importPresentation, deckSlides, deckDir, removeDeck, readPptx };
