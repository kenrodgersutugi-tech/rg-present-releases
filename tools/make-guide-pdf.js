/**
 * Prints docs/guide.html into docs/RG-Present-Setup-Guide.pdf.
 *
 * The PDF is not a second copy of the guide: it is the same file, printed. The
 * @media print rules in docs/assets/site.css decide how it looks on paper, so
 * a change to the guide reaches the PDF the next time this is run and the two
 * can never drift apart.
 *
 *   cd app && npx electron ../tools/make-guide-pdf.js
 *
 * (Run under xvfb-run on a machine with no display.)
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DOCS = path.join(__dirname, '..', 'docs');
const SOURCE = path.join(DOCS, 'guide.html');
const TARGET = path.join(DOCS, 'RG-Present-Setup-Guide.pdf');

// Small, grey, and the same on every page: the name of the thing you are
// holding, and where it came from, for a copy that has been photocopied twice.
const FOOT = `
  <div style="width:100%;font-family:'Segoe UI',sans-serif;font-size:7.5pt;color:#6b7684;
              padding:0 14mm;display:flex;justify-content:space-between;">
    <span>RG-Present &mdash; setup guide</span>
    <span>kenrodgersutugi-tech.github.io/rg-present-releases</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 1400,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });

  await win.loadFile(SOURCE);

  // Paper is white: drop the theme the page script chose so the print rules in
  // site.css apply on their own. Then wait for the webfont, or the first page
  // is laid out in a fallback face and the line breaks are wrong.
  await win.webContents.executeJavaScript(`
    document.documentElement.removeAttribute('data-theme');
    document.fonts.ready.then(() => true);
  `);
  await new Promise((r) => setTimeout(r, 800));

  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0.55, bottom: 0.7, left: 0.6, right: 0.6 },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: FOOT,
    generateDocumentOutline: true,
  });

  fs.writeFileSync(TARGET, pdf);
  console.log(`${path.relative(process.cwd(), TARGET)}  ${pdf.length.toLocaleString()} bytes`);
  app.quit();
});
