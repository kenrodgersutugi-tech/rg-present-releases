# RG-Present changelog

App, database schema and content packs are versioned separately:
- **App version**: `package.json` → shown in Settings → Versions.
- **Schema version**: `MIGRATIONS` in `src/main/db.js` (the library is backed up before every upgrade).
- **Content pack versions**: each pack's `manifest.json`; see the pack's own `CHANGELOG.md`.

## App 1.9.0 (2026-11-11)
### RG-Present is now licensed
- **Two weeks free on every computer**, with nothing held back. After that a licence is needed
  before anything new goes on the audience screen.
- **Churches already using RG-Present keep it free for 90 days** after this update reaches them,
  so nobody is caught out on a Sunday by an update they did not ask for. It is granted once per
  library and shown as a countdown on the operator screen.
- **Pay with M-Pesa inside the program**: KES 300 for one Sunday (seven days), 700 a month,
  7,000 a year, 30,000 for a lifetime licence. Choose a plan, approve the payment on the phone,
  and the licence turns itself on. Closing the window does not lose it: RG-Present collects the
  licence when the payment settles, even days later.
- **Or type in a key** (RGPRS-XXXXX-XXXXX-XXXXX-XXXXX) for a licence bought from RG Devs.
- A licence covers one computer and is checked **on that computer**, against a key built into the
  app, so a church with no internet keeps working between renewals.

### What a licence never does
- **It never interrupts a service.** If a licence lapses while a hymn is on the screen, the
  service carries on to the end; only the next thing to go up waits. No check, renewal or message
  happens while anything is on the audience screen.
- **It never touches the audience screen.** Everything licensing has to say is said on the
  operator's screen.
- **It never holds your work.** The library, editing songs, building, saving and printing the
  order of service, the stage display and every import all keep working without a licence.
- **Nothing is deleted, ever.**

### Smaller
- Settings shows the licence, and the new licence box is reachable from the strip at the bottom of
  the operator screen.
- The Microsoft Store copy is licensed with a key instead of paying in the app, because the Store
  does not allow paying for digital goods inside an app.

## App 1.8.2 (2026-11-08)
- **Store package only:** its display name is now **RG Present**, the name reserved in Partner
  Center. The Store will not take a package whose name is not reserved there, and the hyphenated
  RG-Present is not. Everywhere else — the installer, the window, this changelog — the product is
  written RG-Present as it always has been.
- **Store package only:** it now declares Windows 10 version 1809 (10.0.17763.0) as its minimum,
  which is what the Microsoft Store requires and what the copy already in the Store declares.
  The installer from the website is unchanged by this, and still runs on any 64-bit Windows 10 or 11.
- The button that opens the setup guide now wears a **question mark in a circle**. As a book
  outline at the size the title bar draws it, it read as an empty box, and the one button nobody
  should have to puzzle over is the one marked help.

## App 1.8.1 (2026-11-06)
### The guide is in the program now
- **Press F1, or the book button beside Settings, and the setup guide opens** — installing it,
  connecting the projector, building a service, running it on Sunday, and what to do when
  something goes wrong on the morning.
- The guide travels **inside the installation as a PDF**, so it opens in a hall with no signal.
  Where a build has not got it, the copy on the website is opened instead.
- **Settings now carries the website**, the setup guide, the privacy policy and the terms, so a
  volunteer at the laptop can find all of it without being told an address. Only those five
  addresses can ever be opened: a page cannot make RG-Present open one of its own.

### Smaller
- The toolbar **fits a 1280x720 screen** again. Its labels now give way to the icons just below
  1366 wide rather than just below 1250, which is where they started to run off the end.

## App 1.8.0 (2026-11-05)
### Music
- **Play music from the Media tab** — before the service, under a reflection, behind the
  notices. Add `.mp3`, `.m4a`, `.wav` and the rest the same way you add pictures, then click one
  to play it.
- It **keeps playing** while you move through slides, take a reading live or black the screen,
  and it **fades in and out** rather than cutting. By default it fades out when something goes on
  the screen; if you want music under the service, turn that off in Settings.
- A small transport appears under **Live** only while something is playing: pause, loop, how
  loud, and stop.

### Notes for the musicians and the preacher
- Put a note on any line of the service — "Key of G · two verses only · pause for the
  children". It shows on the **stage display** at the front and **never** on the audience
  screen.

### Drag files straight in
- Drop pictures, music, a **PowerPoint** or a **PDF** anywhere on the window. Media goes into
  your library; a deck is imported as a presentation. The memory stick with this week's notices
  is now two seconds from the screen.

### Also in this version
- RG-Present is on the **Microsoft Store**. A Store copy is kept up to date by Windows, so it
  never checks or installs anything itself — the Updates window says so. The version you
  download from the web still updates itself exactly as before.

## App 1.7.0 (2026-11-03)
### Pictures fill the screen
- A photograph is never the shape of a projector, and RG-Present was putting black bars round
  every one. **Pictures now fill the screen**, cropping whatever does not fit, the way every
  other presentation program does. Presentation slides are left alone — cropping one would cut
  the words off it.

### Ask RG-Present (needs your own Google Gemini key — optional)
- **Ask** in the toolbar, or **Ctrl+Shift+A**. One box, four questions:
  - **Find a hymn** for what the service is about — "a hymn about the cross for Good Friday".
    It searches **your own library**, Kimeru hymns included, and can only ever suggest hymns you
    actually have.
  - **Find a reading** from a half-remembered description — "where does it say train up a
    child". It gives the reference; **the words come out of your own Bible**, so nothing
    invented can reach the screen.
  - **Notes into slides** — paste the week's notices and get slides a congregation can read,
    with names, times and places kept exactly as you wrote them.
  - **Plan a service** from a theme — headings, hymns from your library and readings, which you
    can rearrange or remove before anything goes live.
- **Generated backgrounds**: type the theme of a service and get a background picture and a
  matching theme. This one needs billing turned on for your Google key — Google's free tier
  cannot generate images at all. Everything else above works on a free key.
- Nothing is sent anywhere unless you press a button, your key stays on your computer, and
  RG-Present works exactly as before without one.

### Working at the desk
- **Tapping twice always goes live now**, including a single Bible verse. It used to miss,
  because the first tap redrew the list under the second one.
- **Name a line of the service** — "First reading", "Offertory" — with the button on it or
  **F2**. The congregation still sees the hymn's own title.
- **Headings in the order of service** — Opening, Communion, Sending out — that fold away with
  everything under them. Any line can be **duplicated**.
- **Rearrange a song's slides at the desk**: right-click a slide in Preview to split it, join
  it with the next, move it, leave it out of this service, or put the originals back. None of
  it changes the hymn in your library.
- **A reading in two languages** on one slide, matched verse by verse, for a bilingual
  congregation. The second translation is chosen in the Scripture tab.

### Words and fonts
- **Colour, bold, italic, underline, font and size on just the words you choose** when editing
  a song. Select the words and use the buttons over the lyrics box.
- **A font for every slide** in Settings, used by any theme that does not name its own.

### Fitting your screen
- The window used to ask for a size **bigger than a 1366×768 laptop screen**, so un-maximising
  it put the Go Live button past the edge. It now fits the screen it opens on, panel sizes
  saved on one computer can no longer break the layout on a smaller one, and double-clicking a
  divider puts it back where it started.

### Presentations and the web
- **Show a web page on the audience screen** — a hymn video, a funeral stream — with no
  toolbar, no address bar, no cursor and nothing clickable. A red strip on the operator screen
  says while it is up, with the button to take it off.
- **Re-read a presentation from its file**: this week's notices in place of last week's, with
  one button, keeping its place in any saved service.

## App 1.6.0 (2026-11-01)
### The web, inside RG-Present
- **Web** in the toolbar (or **Ctrl+Shift+W**) opens a browser in a window of its own. One box:
  type what you are looking for and it searches, or type an address and it goes there.
- It opens on **your** screen, never the projector's, so nothing of the web can reach the
  congregation by accident. The page runs sealed off from the rest of RG-Present: it cannot see
  your songs, your service or the audience screen, and nothing downloads itself onto the church
  computer.
- **Right-click a picture → Save this picture to Media**, and a backdrop you found online is in
  your media library, ready to go behind the words.

### Presentations
- A **Presentations** tab beside Songs, Scripture and Media. Add a **PowerPoint (.pptx)** or a
  **PDF**, and every slide is kept as a picture in your own library.
- Because they are pictures, a deck still shows after the PowerPoint has gone home on somebody's
  memory stick — and **PowerPoint never runs during your service**, so it can never put a dialog
  on the projector in the middle of the notices.
- Double-click a deck to put it on the screen, or drag it into the service order to keep it with
  the songs and the readings. → and ← walk through the slides like any other item.
- A PDF comes in looking exactly as it was designed and needs nothing else installed, so for a
  deck that really matters, **save it as PDF** before you bring it across. A PowerPoint is used
  as-is if Office is on the computer, and read straight out of the file if it is not.
- A saved service whose presentation has since been deleted says so on the operator screen
  rather than sending an empty slide to the screen.

## App 1.5.1 (2026-10-25)
- **One language on a slide.** The two-language slide added in 1.5.0 is gone: a Kimeru hymn stays
  purely Kimeru and an English hymn purely English. The **EN / KIM** switch in Preview still moves a
  hymn between its translations, whole slide at a time.

## App 1.5.0 (2026-10-25)
### Keep reading
- **Read on** beside the Live controls (or **]**) carries a reading past where it was going to stop —
  the next verse, and over into the next chapter when the chapter runs out. Everything already read
  stays on the slides behind, and the reference on screen keeps up (John 2:24–3:2).
- Pressing → at the end of a reading with nothing after it in the service reads on by itself.

### Printed order of service
- **Print** in the toolbar (or **Ctrl+P**) makes a PDF for the people who are not at the computer:
  the running order with hymn numbers for the preacher and the sound desk, and — if you want it —
  every word of every song and the readings in full, for the musicians.
- It opens as soon as it is saved, and prints the same on any machine.

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
