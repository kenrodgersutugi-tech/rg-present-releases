# RG-Present — downloads (RG DEV Industries build)

This repository holds the **Windows installers** for the RG DEV Industries build of RG-Present,
its release notes and its download page. It is the only place that build is published.

`app/` holds the source of the RG DEV Industries build of RG-Present (hymn library, Bibles, themes,
dual-screen output), and `.github/workflows/release.yml` builds and publishes its installer whenever
a `v*` tag is pushed. See [`app/PUBLISHING.md`](app/PUBLISHING.md).

## Download

**[Download RG-Present for Windows](https://kenrodgersutugi-tech.github.io/rg-present-releases/)**

Or take the installer directly — this link always gives the newest published version:

```
https://github.com/kenrodgersutugi-tech/rg-present-releases/releases/latest/download/RG-Present-Setup.exe
```

## What is in a release

| File | What it is |
| --- | --- |
| `RG-Present-Setup.exe` | The installer, under a fixed name so the link above never changes |
| `RG-Present-Setup-<version>.exe` | The same installer, named by version. **Required by the updater — never delete it.** |
| `*.rgpkg` | The song, theme and Bible packs. **Required:** installed copies fetch these to update their libraries. |
| `updates.json` | Tells installed copies what the newest version is, with a SHA-256 for every file. **Required.** |

Deleting any file marked *required* breaks automatic updates for every church already running
RG-Present. If a release turns out to be bad, set it back to a **draft** instead — installed
copies ignore drafts. The full procedure is in [`app/PUBLISHING.md`](app/PUBLISHING.md).

## The website

`docs/` is published with GitHub Pages at
<https://kenrodgersutugi-tech.github.io/rg-present-releases/> by `.github/workflows/pages.yml`,
on every push to `main` that touches `docs/`.

| Page | What it is for |
| --- | --- |
| `index.html` | What RG-Present is, with screenshots of the real program |
| `download.html` | The installer, the Microsoft Store, the PDF guide and the release history |
| `guide.html` | The setup guide, and the only source the PDF is printed from |
| `privacy.html` | What leaves a church's computer, and what never does |
| `terms.html` | The licence the software is given under |
| `RG-Present-Setup-Guide.pdf` | `guide.html`, printed. Rebuilt by `tools/make-guide-pdf.js` |

Every page is static, sets no cookies, has no trackers or analytics, and makes no third-party
requests, so it loads on a slow mobile connection. The screenshots are WebP and the one font is
a subset of Inter (SIL OFL-1.1, licence beside it in `docs/assets/`). Each page works out which
repository it belongs to from its own URL, so moving these repositories to an organisation needs
no edit.

**After editing `docs/guide.html`, reprint the PDF** so the two cannot drift apart:

```
cd app && xvfb-run -a npx electron ../tools/make-guide-pdf.js   # on Windows: npx electron ..\tools\make-guide-pdf.js
```

## About

RG-Present is church presentation software made by **RG Devs** in Kenya. Report a problem
using the issues tab, or use the support contacts on the download page.
