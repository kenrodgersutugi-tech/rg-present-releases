/**
 * Copies the setup guide PDF into build/guide so electron-builder can ship it
 * inside the installation (see `extraResources` in package.json).
 *
 * A church laptop in a hall with no signal still has to be able to read the
 * guide, which is why it travels with the program instead of being a link.
 *
 *   node tools/bundle-guide.js
 *
 * If the PDF is missing the folder is still created, so packaging never fails
 * over it; the app falls back to the copy on the website.
 */
const fs = require('node:fs');
const path = require('node:path');

const NAME = 'RG-Present-Setup-Guide.pdf';
const source = path.join(__dirname, '..', '..', 'docs', NAME);
const target = path.join(__dirname, '..', 'build', 'guide');

fs.mkdirSync(target, { recursive: true });

if (!fs.existsSync(source)) {
  console.warn(`bundle-guide: ${NAME} is not in docs/ — packaging without it.`);
  process.exit(0);
}

fs.copyFileSync(source, path.join(target, NAME));
console.log(`bundle-guide: ${NAME} (${fs.statSync(source).size.toLocaleString()} bytes) ready to package.`);
