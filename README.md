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
| `rg-present-<version>-setup.exe` | The same installer, named by version. **Required by the updater — never delete it.** |
| `*.exe.blockmap` | Lets an update download only the parts that changed. **Required.** |
| `latest.yml` | Tells installed copies what the newest version is. **Required.** |
| `beta.yml` | The same, for installs that have opted into pre-releases |

Deleting any file marked *required* breaks automatic updates for every church already running
RG-Present. If a release turns out to be bad, set it back to a **draft** instead — installed
copies ignore drafts. The full procedure is in [`app/PUBLISHING.md`](app/PUBLISHING.md).

## The download page

`docs/` is published with GitHub Pages. It is static, has no trackers or analytics, and makes
no third-party requests, so it loads on a slow mobile connection. It works out which
repository it belongs to from its own URL, so moving these repositories to an organisation
needs no edit to the page.

## About

RG-Present is church presentation software made by **RG Devs** in Kenya. Report a problem
using the issues tab, or use the support contacts on the download page.
