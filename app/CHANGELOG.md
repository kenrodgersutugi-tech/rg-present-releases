# RG-Present changelog

App, database schema and content packs are versioned separately:
- **App version**: `package.json` → shown in Settings → Versions.
- **Schema version**: `MIGRATIONS` in `src/main/db.js` (the library is backed up before every upgrade).
- **Content pack versions**: each pack's `manifest.json`; see the pack's own `CHANGELOG.md`.

## App 1.4.0 (2026-10-25)
### Scripture people can place from the back row
- The **reference is much larger and brighter** on the audience screen — "John 3:16 · KJV" now reads
  from the back of the church. Four sizes under **Settings → Scripture → Reference size on screen**,
  and it grows with the A+ text size like everything else.

### Messages across the screen
- **Message** in the Live controls (or **Ctrl+M**) puts a line over whatever is live — a song, a
  reading, even a black screen — for a nursery call or a car blocking the gate. Choose the top or
  the bottom of the screen, three sizes, and how long it stays before it takes itself down.
- The reading's reference and the song's name step up out of its way, however many lines it runs to.
- The last eight messages are kept, because the same ones come round most Sundays. Ctrl+M again, or
  the Message button, takes it down.
- A message is only ever on the audience screen: the preview and the slide thumbnails stay clean.

### Films and clips that can be heard
- A video in the service now has **Pause, Sound and Loop** beside the Live controls (**K** and **M**),
  so a clip can be played with its sound, held on a frame and let run once instead of looping.

### Find and show (Ctrl+K)
- One box for a hymn number, a title, a line of a song, a reference like `Jn 3:16` or a picture:
  **Enter** previews it, **Shift+Enter** puts it straight on the screen. For the moment somebody
  calls out a hymn mid-service.

## App 1.3.1 (2026-10-25)
- **Fits a small laptop.** On a 1024x768 or similar screen the title bar no longer pushed the Live
  panel and its controls off the side; below 1250 pixels wide the toolbar shows its icons alone.
- Tested by installing the published release on a clean Windows machine: it installs silently,
  starts, loads the 3,648 hymns and the KJV, and uninstalls again.

## App 1.3.0 (2026-10-25)
### Straight to the screen
- **Double-click a song, a picture or a video in the library and it goes live at once**, without
  joining the service — for the hymn called out from the floor or the notice handed over mid-service.
  It is previewed at the same time, so the rest of its slides are to hand. "Add to service", Enter
  and dragging still build the running order as before.
- The song panel has a **Go live** button beside **Add to service**.

### A picture or video behind the words
- Any item can carry its **own background** — a photo or a looping video — with the words of the
  song, reading or announcement still on top: the **picture button** in the Preview panel's corner,
  or the picture button on a media card in the library. "Use the theme's own background" puts it back.
- The background follows the item, so it is there whether the item is in the service or sent live
  straight from the library.

### Stage display
- The musicians' stage display names the verse on the wall (**Psalms 23:1**) and, like the audience
  screen, shows **one verse at a time**, with the next verse underneath.

### Updating a church computer by itself
- **Updates install themselves**: song, theme and Bible packs as soon as they are found, and a new
  version of the program downloads quietly and installs **when RG-Present is closed** — never during
  a service. Switch it off in **Settings → Updates**, and nothing is contacted at all if no update
  source is set.
- For whoever publishes: `npm run release 1.3.0` bumps the version, tags it and pushes, and the
  build on GitHub does the rest.

## App 1.2.0 (2026-10-25)
### The audience screen
- **Fills any screen.** The slide now takes the shape of the screen it is shown on, so a 4:3 or 16:10
  projector, an ultrawide TV or a windowed output is filled edge to edge instead of sitting in black
  bars. The operator's Preview and Live monitors and the slide thumbnails take that same shape, so
  what the operator sees is what the congregation sees.
- A projector plugged in, removed or switched to another resolution mid-service re-frames everything
  straight away.

### Bigger or smaller words, during the service
- **A− / A+ beside the Live controls** change the size of the words on the audience screen from 70%
  to 200%, with the current size shown between them; click it to go back to 100%.
- Keyboard: `+` and `−` (or Ctrl+= / Ctrl+−, which work even while typing in the search box), Ctrl+0
  to reset.
- The size is saved, so the next service starts where you left it, and can also be set under
  **Settings → Slides → Text size on screen**. Text still has to fit its box, so lines are never cut off.

### Scripture
- **Readings go live one verse at a time** — the way a congregation follows them. Set it under
  **Settings → Scripture → Verses per slide** (one, two, three, four, or as many as the slide holds).

### Updates
- A new install already points at the project's GitHub releases, so a church computer offers the
  next version with one click without anyone setting it up. Clearing the source in
  **Settings → Updates** still means nothing is ever contacted.

## App 1.1.0 (2026-10-04)
### In-app updater
- **Settings → Updates**: set one update source — a web address, or a folder on the church network
  holding `updates.json` — and RG-Present checks it for new versions of the program *and* of the song,
  theme and Bible packs. With no source set, nothing is ever contacted.
- One-click install: the app update downloads with a progress bar, then **Install and restart** runs the
  installer and reopens. Pack updates install straight away without restarting.
- Every download is checked against a SHA-256 checksum before it is run or installed; the installer is
  checked again immediately before it runs, and discarded if it changed on disk.
- The library, Bibles and settings are backed up before an app update is applied.
- **Rollback**: if the new version fails to finish starting twice, the next launch offers to reinstall
  the previous version and restore the backup taken before the update. The same rollback is available
  by hand from Settings → Updates.
- A failed or cancelled install is detected on the next start and reported, leaving the working version
  in place.
- Quiet automatic check a few seconds after startup (can be switched off); an unreachable server is
  ignored so a service is never interrupted.
- `npm run make-feed -- <folder>` publishes the installer, the packs and `updates.json` into one folder,
  with checksums, ready to copy to a share or a web server.

## App 1.0.0 (2026-10-04)
### Scripture
- Bible module: book/chapter browser, reference box (`John 3:16-18`, `Ps 23`, `1 Cor 13:4-7`, `Rom 8:28-9:2`)
  and whole-Bible word search; click or Shift+click to choose a verse range.
- Passages go into the service like songs, split into slides on whole verses, with the reference always
  shown on screen and superscript verse numbers.
- Switch a passage between translations from Preview (KJV / NIV / …).
- Ships with the **King James Version** (31,102 verses, public domain). Other translations are imported
  from files you are licensed to use: Zefania XML, OpenSong XML, OSIS XML, CSV or JSON.
- Bibles live in their own database file, so the song library stays fast.

### Hymns — 3,070 songs preloaded
- **The Open Hymnal (2014.06)** — 292 curated classics (Amazing Grace, Blessed Assurance, The Old Rugged
  Cross, It Is Well With My Soul, To God Be The Glory …) with verse/chorus structure and authors.
- **The Christian Hymn Book (1870)** — 1,324 hymns.
- **Wesleyan Methodist Hymn Book (1869)** — 773 hymns.
- **The Otterbein Hymnal (1890)** — 545 hymns.
- **Iuku ria Rwimbo (Kimeru)** — 132 hymns + 4 liturgy texts, each with its English title for searching.
- 54 Kimeru hymns are linked to their English counterpart for the EN/KIM switch.

### Service
- Countdown timer item: counts down a number of minutes or to a clock time, with a message and an
  end-of-countdown message. Runs on the audience screen and the stage display.
- App icon and logo screen.

## App 0.1.0 (2026-09-27)
- First working build: song library with search (number, title, English title, any line; Kimeru ĩ/ũ match
  plain i/u), service schedule with drag-and-drop, preview and live panels, Go Live, Black / Clear / Logo,
  next/previous, verse and chorus jump keys, auto-advance, fade transitions.
- Audience output on a chosen screen (moves automatically when a projector is plugged in); stage display
  with current/next slide and clock.
- Song editor with live slide preview, per-song theme and verse order; theme designer; text/announcement
  slides; image and video media.
- Import hymns from TXT, CSV, Word (.docx) and PowerPoint (.pptx with text); re-importing updates in place.
- Content packs (.rgpkg): install/update from Settings, export songs as a pack. Local edits survive updates.
- Autosave of the current service for crash and power-cut recovery.
- Schema v1.
