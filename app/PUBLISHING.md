# Publishing RG-Present

Created by **RG DEV Industries** · rgdev.ke@gmail.com

## Where the code lives

This app is the `app/` folder of <https://github.com/kenrodgersutugi-tech/rg-present-releases>, which
also carries the download page (`docs/`) and publishes every release. Run every command below from
inside `app/`.

## Releasing a new version

```bash
cd app
npm version 1.3.0 --no-git-tag-version    # bumps package.json
cd ..
git commit -am "RG-Present 1.3.0"
git tag v1.3.0
git push && git push --tags
```

Pushing the tag runs `.github/workflows/release.yml` at the top of the repository, which on a GitHub Windows runner builds the
icons, the content packs and the installer, then publishes a Release containing:

- `RG-Present-Setup-1.3.0.exe`, and a copy named `RG-Present-Setup.exe` for the download page's
  fixed link
- every `*.rgpkg` content pack
- `updates.json` with SHA-256 checksums for all of them

## Pointing the churches' computers at it

Once, on each computer: **Settings → Updates → Update source**

```
https://github.com/kenrodgersutugi-tech/rg-present-releases/releases/latest/download/updates.json
```

From then on each machine checks quietly at startup and offers the update with one click. Because
the repository is public, no login or token is needed on the church computers.

Prefer not to rely on the internet during a service? Run `npm run make-feed -- "\church-server\rgpresent"`
instead and point the computers at that folder on the local network. Both work the same way.

## What is deliberately not in this repository

- **Copyrighted Bible translations** (NIV, HCSB and so on). Only the public-domain King James Version
  is included. Each church imports translations it is licensed to use, through
  Settings → Import Bible, or `RG-Present.exe --install-bible <file> --abbrev NIV`.
- `node_modules/`, `dist/`, the built `content/*.rgpkg` and generated icons — all rebuilt by the workflow.
