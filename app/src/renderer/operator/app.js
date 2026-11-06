/* Operator core: service (schedule), preview, live output, keyboard control. */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const rg = window.rg;
  const L = window.RGLyrics;

  const App = {
    settings: null,
    themes: new Map(),
    service: { id: null, name: 'Untitled service', items: [] },
    dirty: false,
    preview: null, // { index, item, r (resolved), slide }
    live: null,
    cover: null,
    auto: { on: false, timer: null },
    alert: null,                                  // the message currently across the screen
    mediaPlayback: { sound: false, paused: false, loop: true },
    songCache: new Map(),
    $, $$,
  };
  window.App = App;

  // ---------- helpers ----------
  let toastTimer;
  /** The sentence inside an error, without Electron's IPC wrapper around it. */
  App.errorText = (e) => String((e && e.message) || e || '')
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(Error|TypeError):\s*/, '')
    .trim();

  App.toast = (msg, isError) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2400);
  };
  /**
   * The setup guide: the PDF inside the installation where there is one, the
   * copy on the website where there is not. Either way it opens outside
   * RG-Present, so nothing of the service is disturbed by reading it.
   */
  App.openGuide = async () => {
    try {
      const where = await rg.invoke('app:open-guide');
      App.toast(where && where.opened === 'web' ? 'Opening the setup guide on the website' : 'Opening the setup guide');
    } catch (e) {
      App.toast(App.errorText(e), true);
    }
  };

  App.uid = () => Math.random().toString(36).slice(2, 10);
  App.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.langLabel = (code) => ({ en: 'EN', mer: 'KIM', sw: 'SW' }[code] || (code || '?').toUpperCase().slice(0, 3));

  App.loadThemes = async () => {
    const list = await rg.invoke('themes:list');
    App.themes = new Map(list.map((t) => [t.id, t]));
  };
  App.themeFor = (id) => App.themes.get(id) || App.themes.get(App.settings.defaultThemeId) || App.themes.values().next().value || {};

  App.getSong = async (id, fresh) => {
    if (!fresh && App.songCache.has(id)) return App.songCache.get(id);
    const s = await rg.invoke('songs:get', id);
    if (s) App.songCache.set(id, s);
    return s;
  };

  // ---------- resolving items to slides ----------
  /** An item can carry its own background picture or video, shown behind its words. */
  App.themeWithBackground = (theme, item) => {
    const bg = item && item.background;
    if (!bg || !bg.url) return theme;
    return { ...theme, background: { type: bg.type === 'video' ? 'video' : 'image', value: bg.url } };
  };

  const resolveItem = async (item) => {
    const opts = { maxLines: App.settings.maxLinesPerSlide, autoChorus: App.settings.autoChorus };
    if (item.type === 'song') {
      const song = await App.getSong(item.songId);
      if (!song) return { kind: 'song', title: `${item.title} (missing)`, slides: [], theme: App.themeFor(item.themeId) };
      return {
        kind: 'song', song, title: song.title, number: song.number, author: song.author, copyright: song.copyright,
        slides: L.buildSlides(song, opts), theme: App.themeFor(item.themeId || song.theme_id),
      };
    }
    if (item.type === 'custom') {
      const sections = L.textToSections(item.text || '');
      return { kind: 'custom', title: item.title, slides: L.buildSlides({ sections }, { ...opts, autoChorus: false }), theme: App.themeFor(item.themeId) };
    }
    if (item.type === 'scripture') {
      const B = window.RGBible;
      const verses = await rg.invoke('bible:passage', { id: item.bibleId, ref: item.ref });
      const title = `${B.formatReference(item.ref)}${item.abbrev ? ` (${item.abbrev})` : ''}`;
      if (!verses.length) return { kind: 'scripture', title: `${title}: not in this Bible`, slides: [], theme: App.themeFor(item.themeId) };

      /*
       * A second translation, read alongside the first. A congregation that worships in two
       * languages hears the reading twice; this puts both on one slide so nobody is looking at
       * words they cannot read while the other half is being read.
       *
       * The two are matched verse by verse, so verse 16 sits over verse 16 even where the
       * translations break their sentences differently.
       */
      if (item.alongside) {
        const second = await rg.invoke('bible:passage', { id: item.alongside, ref: item.ref });
        if (second.length) {
          const byVerse = new Map(second.map((v) => [`${v.chapter}:${v.verse}`, v.text]));
          const paired = verses.map((v) => ({
            ...v,
            text: [v.text, byVerse.get(`${v.chapter}:${v.verse}`) || ''].filter(Boolean).join('\n\n'),
          }));
          const slides = B.buildScriptureSlides(paired, item.ref, {
            // One verse at a time: two languages of the same verse already fill a slide.
            versesPerSlide: 1,
            maxChars: Math.round((App.settings.scriptureMaxChars || 320) * 1.6),
            verseNumbers: App.settings.scriptureVerseNumbers,
          });
          return {
            kind: 'scripture', title: `${title} + ${item.alongsideAbbrev || ''}`.trim(),
            abbrev: `${item.abbrev || ''} · ${item.alongsideAbbrev || ''}`.trim(),
            slides, theme: App.themeFor(item.themeId || App.settings.scriptureThemeId),
          };
        }
      }
      const slides = B.buildScriptureSlides(verses, item.ref, {
        versesPerSlide: App.settings.scriptureVersesPerSlide,
        maxChars: App.settings.scriptureMaxChars,
        verseNumbers: App.settings.scriptureVerseNumbers,
      });
      return { kind: 'scripture', title, abbrev: item.abbrev, slides, theme: App.themeFor(item.themeId || App.settings.scriptureThemeId) };
    }
    if (item.type === 'countdown') {
      return { kind: 'countdown', title: item.title, slides: [{ label: 'Countdown', code: '', text: item.message || '', countdown: item }], theme: App.themeFor(item.themeId) };
    }
    if (item.type === 'deck') {
      // Each slide of the presentation is a picture of its own, shown the way any other
      // picture is. Nothing of PowerPoint is running, so nothing of PowerPoint can appear.
      const slides = await rg.invoke('decks:slides', item.deckId);
      // A service saved last year can outlive the presentation it names. Say so on the
      // operator's screen rather than sending an empty item to the projector.
      if (!slides.length) {
        return {
          kind: 'deck',
          title: item.title,
          missing: true,
          slides: [{ label: 'Missing', code: '', text: `“${item.title}” is no longer in the presentations. Add the file again.` }],
          theme: App.themeFor(item.themeId),
        };
      }
      return {
        kind: 'deck',
        title: item.title,
        slides: slides.map((rel, i) => ({
          label: `Slide ${i + 1}`, code: '', text: '',
          media: { type: 'image', url: rel, fit: 'contain' },
        })),
        theme: App.themeFor(item.themeId),
      };
    }
    if (item.type === 'media') {
      return { kind: 'media', title: item.title, slides: [{ label: item.mediaType === 'video' ? 'Video' : 'Image', code: '', text: '', media: { type: item.mediaType, url: item.rel } }], theme: App.themeFor(item.themeId) };
    }
    return { kind: 'unknown', title: '?', slides: [], theme: App.themeFor() };
  };

  App.resolve = async (item) => {
    const r = await resolveItem(item);
    /*
     * Slides rearranged for this service only.
     *
     * A verse too long for the screen, two short verses that belong together, a slide to leave
     * out this morning — all of it is decided at the desk, often minutes before the service,
     * and none of it should rewrite the hymn in the library that every other church service
     * uses. So the arrangement is kept on this line of the service, and "Reset" puts the
     * hymn's own slides back.
     */
    if (Array.isArray(item.slidesOverride) && item.slidesOverride.length) {
      r.slides = item.slidesOverride.map((s) => ({ ...s }));
    }
    // A picture or video chosen for this item wins over the theme's own background; the words,
    // the song or passage footer and the theme's overlay stay exactly as they are.
    r.theme = App.themeWithBackground(r.theme, item);
    // The operator's own name for this line of the service. It belongs on the operator's
    // screen only: the footer the congregation reads still carries the hymn's real title.
    if (item.label) r.label = item.label;
    // What the musicians and the preacher need to know about this line of the service:
    // the key, who leads it, "two verses only", "pause for the children".
    if (item.notes) r.notes = item.notes;
    return r;
  };

  App.payload = (r, i, extra) => {
    const s = r.slides[i] || {};
    const t = App.settings.transition || {};
    const next = r.slides[i + 1];
    return {
      mode: s.countdown ? 'countdown' : s.media ? 'media' : r.slides.length ? 'slide' : 'blank',
      until: s.countdown ? App.countdownUntil(s.countdown) : null,
      endText: s.countdown ? s.countdown.endText || '' : '',
      text: s.text || '',
      label: s.label || '',
      first: !!s.first,
      media: s.media ? { ...s.media, ...App.mediaPlayback } : null,
      item: { title: r.title, number: r.number, author: r.author, copyright: r.copyright, kind: r.kind, reference: s.reference, abbrev: r.abbrev },
      // For the people at the front, never for the congregation: the stage display shows this
      // and the audience window ignores it entirely.
      notes: r.notes || '',
      theme: r.theme,
      logoUrl: App.settings.logoMedia,
      textScale: App.settings.textScale || 1,
      refSize: App.settings.scriptureRefSize || 54,
      fontFallback: App.settings.fontFallback,
      defaultFamily: App.settings.slideFont || '',
      transition: { type: t.type || 'fade', ms: t.ms || 450 },
      next: next ? next.text || next.label : '',
      cover: null,
      ...(extra || {}),
    };
  };

  // ---------- slide grids ----------
  function renderSlides(container, r, selIndex, onPick, onDbl) {
    container.innerHTML = '';
    const cards = r.slides.map((s, i) => {
      const card = document.createElement('button');
      card.className = 'slide-card' + (i === selIndex ? ' sel' : '');
      card.innerHTML = `<div class="thumb"></div><span class="num">${i + 1}</span><div class="cap"><span class="k ${s.type === 'chorus' ? 'type-chorus' : ''}">${App.esc(s.code || '')}</span><span>${App.esc(s.label)}</span></div>`;
      card.addEventListener('click', () => onPick(i));
      if (onDbl) card.addEventListener('dblclick', () => onDbl(i));
      if (container === $('#previewSlides')) {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          onPick(i);
          slideMenu(card, i);
        });
      }
      container.appendChild(card);
      return card;
    });
    // Render thumbnails progressively so long hymns don't block the UI.
    let k = 0;
    const step = () => {
      const end = Math.min(k + 4, cards.length);
      for (; k < end; k++) {
        if (!cards[k].isConnected) return;
        RGRender.renderStatic(cards[k].querySelector('.thumb'), App.payload(r, k));
      }
      if (k < cards.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return cards;
  }

  /**
   * Rearranging the slides of the line in Preview. Every one of these works on a copy, writes
   * it to the item, and redraws — so nothing is changed until the operator asks, and the
   * library is never touched.
   */
  App.slideEdit = async (action, index) => {
    const p = App.preview;
    if (!p || !p.r || !p.r.slides.length) return;
    const item = p.item;
    const slides = (item.slidesOverride && item.slidesOverride.length
      ? item.slidesOverride
      : p.r.slides).map((s) => ({ label: s.label, code: s.code, type: s.type, text: s.text }));

    if (action === 'reset') {
      delete item.slidesOverride;
    } else if (action === 'hide') {
      if (slides.length < 2) return App.toast('That is the only slide', true);
      slides.splice(index, 1);
      item.slidesOverride = slides;
    } else if (action === 'merge') {
      if (index >= slides.length - 1) return App.toast('Nothing after it to join', true);
      slides[index] = { ...slides[index], text: `${slides[index].text}\n${slides[index + 1].text}`.trim() };
      slides.splice(index + 1, 1);
      item.slidesOverride = slides;
    } else if (action === 'split') {
      const lines = String(slides[index].text || '').split('\n').filter((l) => l.trim() !== '');
      if (lines.length < 2) return App.toast('Only one line: nothing to split', true);
      const half = Math.ceil(lines.length / 2);
      const first = { ...slides[index], text: lines.slice(0, half).join('\n') };
      const second = { ...slides[index], text: lines.slice(half).join('\n') };
      slides.splice(index, 1, first, second);
      item.slidesOverride = slides;
    } else if (action === 'earlier' || action === 'later') {
      const to = action === 'earlier' ? index - 1 : index + 1;
      if (to < 0 || to >= slides.length) return;
      const [moved] = slides.splice(index, 1);
      slides.splice(to, 0, moved);
      item.slidesOverride = slides;
    }

    if (App.service.items.includes(item)) App.markDirty();
    const keep = Math.min(index, Math.max(0, (item.slidesOverride || p.r.slides).length - 1));
    await App.setPreview(item, p.index, action === 'earlier' ? Math.max(0, index - 1) : keep);
  };

  /** The little menu on a slide in Preview. */
  function slideMenu(card, index) {
    document.querySelectorAll('.slide-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'slide-menu';
    const overridden = !!(App.preview && App.preview.item && App.preview.item.slidesOverride);
    menu.innerHTML = [
      ['split', 'Split this slide in two'],
      ['merge', 'Join with the next slide'],
      ['earlier', 'Move it earlier'],
      ['later', 'Move it later'],
      ['hide', 'Leave it out of this service'],
      ...(overridden ? [['reset', 'Put the original slides back']] : []),
    ].map(([a, label]) => `<button data-a="${a}">${label}</button>`).join('');
    document.body.appendChild(menu);
    const r = card.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 10)}px`;
    menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 6)}px`;
    menu.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      menu.remove();
      App.slideEdit(b.dataset.a, index);
    }));
    const away = (e) => {
      if (menu.contains(e.target)) return;
      menu.remove();
      document.removeEventListener('mousedown', away);
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
  }

  function markSel(container, i) {
    $$('.slide-card', container).forEach((c, k) => c.classList.toggle('sel', k === i));
    const c = $$('.slide-card', container)[i];
    if (c) c.scrollIntoView({ block: 'nearest' });
  }

  // ---------- preview ----------
  App.setPreview = async (item, index, slideIndex) => {
    const r = await App.resolve(item);
    App.preview = { item, index, r, slide: Math.min(slideIndex || 0, Math.max(0, r.slides.length - 1)) };
    $('#previewTitle').textContent = (r.label || r.title) + (r.number ? `  ·  ${r.number}` : '');
    renderSlides($('#previewSlides'), r, App.preview.slide, (i) => App.previewSlide(i), (i) => { App.previewSlide(i); App.goLive(); });
    App.previewStage.show(App.payload(r, App.preview.slide, { transition: { type: 'cut' } }));
    App.renderSchedule();
    App.updateLangToggle();
    App.updateBackgroundButton();
  };

  App.previewSlide = (i) => {
    if (!App.preview) return;
    App.preview.slide = i;
    markSel($('#previewSlides'), i);
    App.previewStage.show(App.payload(App.preview.r, i, { transition: { type: 'cut' } }));
  };

  App.refreshPreview = async () => {
    if (App.preview) await App.setPreview(App.preview.item, App.preview.index, App.preview.slide);
    if (App.live) {
      App.live.r = await App.resolve(App.live.item);
      App.live.slide = Math.min(App.live.slide, Math.max(0, App.live.r.slides.length - 1));
      renderLiveSlides();
      App.sendLive();
    }
  };

  let langToggleSeq = 0;
  App.updateLangToggle = async () => {
    // Two previews in quick succession: only the newest may show its toggle.
    const seq = ++langToggleSeq;
    const box = $('#langToggle');
    box.hidden = true;
    const stale = () => seq !== langToggleSeq;
    const p = App.preview;
    if (p && p.item.type === 'scripture') {
      // Switch the passage between installed translations (KJV / NIV / HCSB ...).
      const list = await rg.invoke('bible:list');
      if (stale() || list.length < 2) return;
      box.innerHTML = '';
      for (const b of list) {
        const btn = document.createElement('button');
        btn.textContent = b.abbrev;
        btn.title = b.name;
        btn.className = b.id === p.item.bibleId ? 'on' : '';
        btn.onclick = async () => {
          p.item.bibleId = b.id;
          p.item.abbrev = b.abbrev;
          p.item.title = `${window.RGBible.formatReference(p.item.ref)}`;
          App.markDirty();
          await App.setPreview(p.item, p.index, p.slide);
        };
        box.appendChild(btn);
      }
      box.hidden = false;
      return;
    }
    if (!p || p.item.type !== 'song' || !p.r.song || !p.r.song.link_key) return;
    const linked = await rg.invoke('songs:linked', p.r.song.link_key);
    if (stale() || linked.length < 2) return;
    box.innerHTML = '';
    for (const s of linked) {
      const b = document.createElement('button');
      b.textContent = App.langLabel(s.language);
      b.title = s.title;
      b.className = s.id === p.item.songId ? 'on' : '';
      b.onclick = async () => {
        p.item.songId = s.id;
        p.item.title = s.title;
        p.item.language = s.language;
        App.markDirty();
        await App.setPreview(p.item, p.index, p.slide);
      };
      box.appendChild(b);
    }
    box.hidden = false;
  };

  // ---------- live ----------
  function renderLiveSlides() {
    renderSlides($('#liveSlides'), App.live.r, App.live.slide, (i) => App.liveSlide(i));
    $('#liveTitle').textContent = (App.live.r.label || App.live.r.title) + (App.live.r.number ? `  ·  ${App.live.r.number}` : '');
  }

  App.goLive = async (item, index, slide) => {
    musicStepsAside();
    // A "minutes from now" countdown restarts whenever it goes live.
    const target = item || (App.preview && App.preview.item);
    if (target && target.type === 'countdown' && target.mode !== 'clock') target._startedAt = new Date().toISOString();
    if (item) {
      const r = await App.resolve(item);
      App.live = { item, index, r, slide: slide || 0 };
    } else {
      if (!App.preview) return;
      App.live = { ...App.preview };
    }
    renderLiveSlides();
    App.sendLive();
    App.renderSchedule();
    App.restartAuto();
  };

  /**
   * Put something on the screen at once without it joining the service — a song called out from
   * the floor, an announcement, a picture. It is previewed as well, so the next slides are to hand.
   */
  /**
   * Was this the second tap on the same thing, just now?
   *
   * The browser's own dblclick is not good enough here: a single click redraws the song list
   * and the verse list, so the second click lands on a replaced element and the double-click
   * is lost — which is exactly the "sometimes it does not respond" an operator hits mid-service.
   * Counting taps against the item's own id instead of the element survives any redraw.
   */
  let lastTap = { key: null, at: 0 };
  App.doubleTapped = (key, within = 450) => {
    const now = Date.now();
    const same = lastTap.key === key && now - lastTap.at < within;
    lastTap = same ? { key: null, at: 0 } : { key, at: now };
    return same;
  };

  /**
   * Something has gone to the screen, so the music that was covering the silence has done its
   * job. A church that wants the music to carry on under the words turns this off in Settings.
   */
  function musicStepsAside() {
    if (window.RGMusic) RGMusic.liveStarted();
  }

  App.goLiveNow = async (item) => {
    await App.setPreview(item, null, 0);
    await App.goLive(item, null, 0);
    App.toast(`Live: ${item.title || 'slide'}`);
  };

  /** Give the item in Preview its own background picture or video (null puts the theme's back). */
  App.setItemBackground = async (bg) => {
    const p = App.preview;
    if (!p) return App.toast('Choose an item in Preview first', true);
    if (bg) p.item.background = { type: bg.type === 'video' ? 'video' : 'image', url: bg.rel_path || bg.url };
    else delete p.item.background;
    if (App.service.items.includes(p.item)) App.markDirty();
    await App.refreshPreview();
    App.updateBackgroundButton();
    App.toast(bg ? `Background: ${bg.name || 'set'}` : 'Background cleared');
  };

  App.updateBackgroundButton = () => {
    const b = $('#btnBackground');
    if (b) b.classList.toggle('on', !!(App.preview && App.preview.item && App.preview.item.background));
  };

  // ---------- keep reading ----------
  /**
   * Carry a reading on past where it was going to stop — the next verse, and over the chapter
   * boundary when the chapter runs out. The reading on screen simply grows, so everything already
   * read is still there to go back to.
   */
  App.continueReading = async () => {
    const live = App.live;
    if (!live || live.r.kind !== 'scripture') return App.toast('A reading has to be live first', true);
    const B = window.RGBible;
    const item = live.item;
    const ref = { ...item.ref };
    const chapters = (await rg.invoke('bible:structure', item.bibleId)).find((b) => b.book === ref.book);
    if (!chapters) return App.toast('That book is not in this Bible', true);

    const lastChapter = ref.chapterEnd || ref.chapter;
    const inChapter = await rg.invoke('bible:chapter', { id: item.bibleId, book: ref.book, chapter: lastChapter });
    const lastVerse = ref.verse == null ? (inChapter.length ? inChapter[inChapter.length - 1].verse : 0) : (ref.verseEnd || ref.verse);

    let nextChapter = lastChapter;
    let nextVerse = lastVerse + 1;
    if (!inChapter.some((v) => v.verse === nextVerse)) {
      nextChapter = lastChapter + 1;
      nextVerse = 1;
      if (nextChapter > chapters.chapters) {
        return App.toast(`That is the end of ${B.bookName(ref.book)}`);
      }
    }

    item.ref = {
      book: ref.book,
      chapter: ref.chapter,
      verse: ref.verse == null ? 1 : ref.verse,
      chapterEnd: nextChapter,
      verseEnd: nextVerse,
    };
    item.title = B.formatReference(item.ref);
    if (App.service.items.includes(item)) App.markDirty();
    const was = App.live.slide;
    App.live.r = await App.resolve(item);
    $('#liveTitle').textContent = App.live.r.label || App.live.r.title;
    App.liveSlide(Math.min(was + 1, App.live.r.slides.length - 1));
    renderLiveSlides();
    markSel($('#liveSlides'), App.live.slide);
    if (App.preview && App.preview.item === item) await App.setPreview(item, App.preview.index, App.live.slide);
    App.toast(`Reading on: ${B.formatReference({ ...item.ref, chapter: nextChapter, verse: nextVerse, chapterEnd: nextChapter, verseEnd: nextVerse })}`);
  };

  App.updateReadingButton = () => {
    const b = $('#btnKeepReading');
    if (b) b.hidden = !(App.live && App.live.r.kind === 'scripture');
  };

  // ---------- on-screen messages ----------
  /**
   * A line across the audience screen over whatever is live — a nursery call, a car to be moved.
   * It stays up while the operator carries on with the service, and comes down on its own after
   * the number of seconds set in Settings (0 = until it is taken down).
   */
  App.showAlert = (text, opts) => {
    const msg = String(text || '').trim();
    clearTimeout(App._alertTimer);
    if (!msg) return App.clearAlert();
    App.alert = {
      text: msg,
      position: (opts && opts.position) || App.settings.alertPosition || 'bottom',
      size: (opts && opts.size) || App.settings.alertSize || 56,
    };
    App.sendLive();
    App.updateAlertButton();
    const secs = opts && opts.seconds != null ? opts.seconds : App.settings.alertSeconds;
    if (secs > 0) App._alertTimer = setTimeout(() => App.clearAlert(), secs * 1000);
    // Keep the last few messages: the same ones come round most Sundays.
    const recent = [msg, ...(App.settings.alertRecent || []).filter((x) => x !== msg)].slice(0, 8);
    App.settings.alertRecent = recent;
    rg.invoke('settings:set', { alertRecent: recent });
  };

  App.clearAlert = () => {
    clearTimeout(App._alertTimer);
    App.alert = null;
    App.sendLive();
    App.updateAlertButton();
  };

  App.toggleAlert = () => (App.alert ? App.clearAlert() : Dialogs.alert());

  App.updateAlertButton = () => {
    const b = $('#btnAlert');
    if (b) {
      b.classList.toggle('on', !!App.alert);
      b.title = App.alert ? 'Take the message off the screen (Ctrl+M)' : 'Put a message across the screen (Ctrl+M)';
    }
  };

  // ---------- video playback ----------
  App.liveVideo = () => {
    const s = App.live && App.live.r.slides[App.live.slide];
    return s && s.media && s.media.type === 'video' ? s.media : null;
  };

  App.setMediaPlayback = (patch) => {
    App.mediaPlayback = { ...App.mediaPlayback, ...patch };
    App.sendLive();
    App.updateMediaButtons();
    App.updateReadingButton();
  };

  App.updateMediaButtons = () => {
    const bar = $('#videoControls');
    if (!bar) return;
    const v = App.liveVideo();
    bar.hidden = !v;
    if (!v) return;
    $('#btnVideoPlay').innerHTML = App.mediaPlayback.paused ? '▶' : '❚❚';
    $('#btnVideoPlay').title = App.mediaPlayback.paused ? 'Play the video (K)' : 'Pause the video (K)';
    $('#btnVideoSound').classList.toggle('on', !!App.mediaPlayback.sound);
    $('#btnVideoLoop').classList.toggle('on', App.mediaPlayback.loop !== false);
  };

  App.liveSlide = (i) => {
    if (!App.live) return;
    App.live.slide = Math.max(0, Math.min(i, App.live.r.slides.length - 1));
    markSel($('#liveSlides'), App.live.slide);
    App.sendLive();
    App.restartAuto();
  };

  App.sendLive = () => {
    const t = $('#transitionSelect').value;
    const base = App.settings.transition || {};
    const transition = t === 'cut' ? { type: 'cut', ms: 0 } : { type: 'fade', ms: t === 'slow' ? 1200 : base.ms || 450 };
    // The message rides on the live picture only — not on the preview or the slide thumbnails.
    const p = App.live
      ? App.payload(App.live.r, App.live.slide, { cover: App.cover, transition, alert: App.alert })
      : { mode: 'blank', cover: App.cover || 'black', transition, logoUrl: App.settings.logoMedia, alert: App.alert };
    rg.sendOutput(p);
    App.liveStage.show(p);
    App.updateMediaButtons();
    App.updateReadingButton();
    ['black', 'clear', 'logo'].forEach((c) => $('#btn' + c[0].toUpperCase() + c.slice(1)).classList.toggle('on', App.cover === c));
  };

  App.next = () => {
    if (!App.live) return;
    if (App.live.slide < App.live.r.slides.length - 1) return App.liveSlide(App.live.slide + 1);
    // At the end of an item: carry on with the next service item.
    const ni = (App.live.index ?? -1) + 1;
    const nextItem = App.service.items[ni];
    if (App.live.index != null && nextItem) {
      App.goLive(nextItem, ni, 0);
      App.setPreview(App.service.items[ni + 1] || nextItem, App.service.items[ni + 1] ? ni + 1 : ni, 0);
    } else if (App.live.r.kind === 'scripture') {
      App.continueReading(); // nothing after it: read on into the next verse or chapter
    } else App.stopAuto();
  };
  App.prev = () => App.live && App.liveSlide(App.live.slide - 1);

  App.setCover = (c) => {
    App.cover = App.cover === c ? null : c;
    App.sendLive();
  };

  // ---------- text size on the audience screen ----------
  // Steps the operator can step through with A- / A+ during a service, saved for the next one.
  const TEXT_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];

  /** Re-draw the slide thumbnails from what is already resolved (no database round-trip). */
  App.redrawSlideGrids = () => {
    if (App.preview) {
      renderSlides($('#previewSlides'), App.preview.r, App.preview.slide, (i) => App.previewSlide(i), (i) => { App.previewSlide(i); App.goLive(); });
    }
    if (App.live) renderLiveSlides();
  };

  App.setTextScale = (v) => {
    const scale = Math.min(3, Math.max(0.4, Math.round(v * 100) / 100));
    App.settings.textScale = scale;
    const label = $('#textScale');
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
    if (App.preview) App.previewStage.show(App.payload(App.preview.r, App.preview.slide, { transition: { type: 'cut' } }));
    App.sendLive();
    App.redrawSlideGrids();
    rg.invoke('settings:set', { textScale: scale });
    App.toast(`Text size ${Math.round(scale * 100)}%`);
  };

  App.nudgeTextScale = (dir) => {
    const cur = App.settings.textScale || 1;
    const next = dir > 0
      ? TEXT_STEPS.find((s) => s > cur + 0.001)
      : [...TEXT_STEPS].reverse().find((s) => s < cur - 0.001);
    if (next == null) return App.toast(dir > 0 ? 'Already at the largest text size' : 'Already at the smallest text size');
    App.setTextScale(next);
  };

  App.jumpToVerse = (n) => {
    if (!App.live) return;
    const i = App.live.r.slides.findIndex((s) => s.type === 'verse' && new RegExp(`\\b${n}\\b`).test(s.label));
    if (i >= 0) App.liveSlide(i);
  };
  App.jumpToChorus = () => {
    if (!App.live) return;
    const from = App.live.slide + 1;
    const all = App.live.r.slides;
    const i = [...all.keys()].find((k) => k >= from && all[k].type === 'chorus') ?? all.findIndex((s) => s.type === 'chorus');
    if (i >= 0) App.liveSlide(i);
  };

  /**
   * When the countdown should hit zero. A fixed clock time ("10:30") is used for a service start;
   * a length in minutes restarts from now each time the item is sent live.
   */
  App.countdownUntil = (cd) => {
    if (cd.mode === 'clock' && cd.at) {
      const [h, m] = String(cd.at).split(':').map(Number);
      const d = new Date();
      d.setHours(h || 0, m || 0, 0, 0);
      if (d.getTime() < Date.now() - 60 * 60 * 1000) d.setDate(d.getDate() + 1); // after midnight
      return d.toISOString();
    }
    const base = cd._startedAt ? new Date(cd._startedAt).getTime() : Date.now();
    return new Date(base + (cd.minutes || 5) * 60000).toISOString();
  };

  // ---------- auto advance ----------
  App.restartAuto = () => {
    clearTimeout(App.auto.timer);
    if (!App.auto.on || !App.live) return;
    const secs = Math.max(2, parseInt($('#autoSecs').value, 10) || 8);
    App.auto.timer = setTimeout(() => {
      if (!App.live) return;
      if (App.live.slide < App.live.r.slides.length - 1) App.liveSlide(App.live.slide + 1);
      else App.liveSlide(0); // loop (announcement loops before the service)
    }, secs * 1000);
  };
  App.toggleAuto = () => {
    App.auto.on = !App.auto.on;
    $('#btnAuto').classList.toggle('on', App.auto.on);
    App.restartAuto();
  };
  App.stopAuto = () => {
    App.auto.on = false;
    $('#btnAuto').classList.remove('on');
    clearTimeout(App.auto.timer);
  };

  // ---------- service / schedule ----------
  App.markDirty = () => {
    App.dirty = true;
    App.renderServiceName();
    clearTimeout(App._autosave);
    App._autosave = setTimeout(() => rg.invoke('service:autosave', { service: App.service, dirty: App.dirty }), 600);
  };

  App.renderServiceName = () => {
    $('#serviceName').innerHTML = App.esc(App.service.name) + (App.dirty ? '<span class="dirty">●</span>' : '');
  };

  App.addItem = (item, at) => {
    item.id = item.id || App.uid();
    if (at == null || at > App.service.items.length) App.service.items.push(item);
    else App.service.items.splice(at, 0, item);
    App.markDirty();
    App.renderSchedule();
    return item;
  };

  App.addSong = async (songId, at) => {
    const s = await App.getSong(songId, true);
    if (!s) return;
    const item = App.addItem({ type: 'song', songId: s.id, title: s.title, number: s.number, folder: s.folder, language: s.language }, at);
    const index = App.service.items.indexOf(item);
    App.setPreview(item, index, 0);
  };

  /**
   * Name a line of the service — "First reading", "Offertory", "Notices".
   *
   * It renames the line only: the song or passage it points at is untouched, and clearing the
   * name puts the real title back.
   */
  App.renameItem = async (i) => {
    const it = App.service.items[i];
    if (!it) return;
    const heading = it.type === 'group';
    const name = await App.prompt(heading ? 'Rename this heading' : 'Name this line',
      heading ? 'Heading' : 'Shown in the order of service', (heading ? it.title : it.label || it.title) || '');
    if (name === null) return;
    const clean = String(name).trim();
    if (heading) {
      if (clean) it.title = clean;
    } else if (!clean || clean === it.title) delete it.label;
    else it.label = clean;
    App.markDirty();
    App.renderSchedule();
    if (App.preview && App.preview.item === it) App.renderPreviewHeader && App.renderPreviewHeader();
  };

  /**
   * Notes for the people at the front. They appear on the stage display, which faces the band
   * and the preacher, and nowhere near the audience screen.
   */
  App.editNotes = async (i) => {
    const it = App.service.items[i];
    if (!it) return;
    const text = await App.prompt('Notes for the stage display',
      'Seen by the musicians and the preacher, never by the congregation', it.notes || '');
    if (text === null) return;
    const clean = String(text).trim();
    if (clean) it.notes = clean; else delete it.notes;
    App.markDirty();
    App.renderSchedule();
    if (App.preview && App.preview.item === it) await App.setPreview(it, i, App.preview.slide);
    if (App.live && App.live.item === it) await App.goLive(it, i, App.live.slide);
  };

  App.removeItem = (i) => {
    App.service.items.splice(i, 1);
    if (App.preview && App.preview.index === i) App.preview.index = null;
    App.markDirty();
    App.renderSchedule();
  };

  App.moveItem = (from, to) => {
    if (from === to || from + 1 === to) return;
    const [it] = App.service.items.splice(from, 1);
    App.service.items.splice(to > from ? to - 1 : to, 0, it);
    App.markDirty();
    App.renderSchedule();
  };

  function itemIcon(it) {
    return { song: 'music', custom: 'text', scripture: 'book', countdown: 'clock', group: 'folder', deck: 'file', media: it.mediaType === 'video' ? 'video' : 'image' }[it.type] || 'file';
  }

  /**
   * A heading in the order of service — "Opening", "Communion", "Sending out".
   *
   * It is an item like any other, so it drags, saves and loads with the service; it simply
   * never goes to the screen. The lines under it fold away with it, which is what makes a
   * twenty-line service readable on a laptop at the back of a church.
   */
  App.addGroup = async () => {
    const name = await App.prompt('Add a heading', 'Heading', 'Opening');
    if (!name) return;
    const item = App.addItem({ type: 'group', title: String(name).trim() || 'Heading' });
    App.renderSchedule();
    return item;
  };

  /** Is this line hidden because the heading above it is folded? */
  function hiddenByFold(index) {
    for (let i = index - 1; i >= 0; i--) {
      const it = App.service.items[i];
      if (it.type === 'group') return !!it.folded;
    }
    return false;
  }

  App.duplicateItem = (i) => {
    const it = App.service.items[i];
    if (!it) return;
    const copy = JSON.parse(JSON.stringify(it));
    delete copy.id;
    App.addItem(copy, i + 1);
  };

  App.renderSchedule = () => {
    const ol = $('#schedule');
    ol.innerHTML = '';
    $('#scheduleEmpty').hidden = App.service.items.length > 0;
    App.service.items.forEach((it, i) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.index = i;
      const isPrev = App.preview && App.preview.item === it;
      const isLive = App.live && App.live.item === it;
      li.className = (isPrev ? 'preview ' : '') + (isLive ? 'live' : '');
      const sub = it.type === 'song' ? [it.number && `#${it.number}`, it.folder, it.language && App.langLabel(it.language)].filter(Boolean).join(' · ')
        : it.type === 'scripture' ? `Scripture · ${it.abbrev || ''}`
        : it.type === 'countdown' ? (it.mode === 'clock' ? `Counts down to ${it.at}` : `${it.minutes} minute countdown`)
        : it.type === 'custom' ? 'Text slide' : 'Media';
      // A church's order of service says "First reading", not "John 3:16-18". The operator's
      // own name for the line wins; what it actually is drops to the line underneath.
      if (it.type === 'group') {
        // A heading: it names a part of the service and folds what is under it.
        const count = (() => { let n = 0; for (let j = i + 1; j < App.service.items.length; j++) { if (App.service.items[j].type === 'group') break; n++; } return n; })();
        li.className += ' group' + (it.folded ? ' folded' : '');
        li.innerHTML = `<i class="grip" data-icon="grip"></i><span class="fold">${it.folded ? '▸' : '▾'}</span>
          <span class="t"><b>${App.esc(it.title)}</b><small>${count} ${count === 1 ? 'item' : 'items'}</small></span>
          <button class="mini ren" title="Rename this heading (F2)"><i data-icon="edit"></i></button>
          <button class="mini rm" title="Remove the heading (what is under it stays)"><i data-icon="x"></i></button>`;
        li.addEventListener('click', (e) => {
          if (e.target.closest('.rm')) return App.removeItem(i);
          if (e.target.closest('.ren')) return App.renameItem(i);
          it.folded = !it.folded;
          App.markDirty();
          App.renderSchedule();
        });
        li.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-rg-item', String(i));
          e.dataTransfer.effectAllowed = 'move';
        });
        ol.appendChild(li);
        return;
      }

      // Lines under a folded heading are put away, not lost.
      if (hiddenByFold(i)) return;

      const shown = it.label || it.title;
      const under = it.label ? [it.title, sub].filter(Boolean).join(' · ') : sub;
      li.innerHTML = `<i class="grip" data-icon="grip"></i><span class="kind ${it.type}"><i data-icon="${itemIcon(it)}"></i></span>
        <span class="t"><b>${App.esc(shown)}</b><small>${App.esc(under)}</small></span>
        <button class="mini note${it.notes ? ' has' : ''}" title="${it.notes ? 'Notes for the musicians: ' + App.esc(it.notes).slice(0, 60) : 'Notes for the musicians and the preacher (shown on the stage display only)'}"><i data-icon="text"></i></button>
        <button class="mini dup" title="Duplicate this line"><i data-icon="copy"></i></button>
        <button class="mini ren" title="Name this line of the service (F2)"><i data-icon="edit"></i></button>
        <button class="mini rm" title="Remove"><i data-icon="x"></i></button>`;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.rm')) return App.removeItem(i);
        if (e.target.closest('.dup')) return App.duplicateItem(i);
        if (e.target.closest('.note')) return App.editNotes(i);
        if (e.target.closest('.ren')) return App.renameItem(i);
        App.setPreview(it, i, 0);
      });
      li.addEventListener('dblclick', (e) => {
        if (e.target.closest('.rm') || e.target.closest('.dup')) return;
        App.goLive(it, i, 0);
      });
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-rg-item', String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      ol.appendChild(li);
    });
    RGIcons.hydrate(ol);
  };

  function setupScheduleDnD() {
    const ol = $('#schedule');
    const panel = $('#schedulePanel');
    const clear = () => $$('li', ol).forEach((li) => li.classList.remove('drop-before', 'drop-after'));
    const targetIndex = (e) => {
      const li = e.target.closest('li');
      if (!li) return App.service.items.length;
      const r = li.getBoundingClientRect();
      return parseInt(li.dataset.index, 10) + (e.clientY > r.top + r.height / 2 ? 1 : 0);
    };
    panel.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (!types.includes('application/x-rg-item') && !types.includes('application/x-rg-song') && !types.includes('application/x-rg-media') && !types.includes('application/x-rg-deck')) return;
      e.preventDefault();
      clear();
      const li = e.target.closest('li');
      if (li) {
        const r = li.getBoundingClientRect();
        li.classList.add(e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before');
      } else ol.classList.add('drag-over');
    });
    panel.addEventListener('dragleave', (e) => {
      if (!panel.contains(e.relatedTarget)) { clear(); ol.classList.remove('drag-over'); }
    });
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      clear();
      ol.classList.remove('drag-over');
      const at = targetIndex(e);
      const item = e.dataTransfer.getData('application/x-rg-item');
      const song = e.dataTransfer.getData('application/x-rg-song');
      const media = e.dataTransfer.getData('application/x-rg-media');
      const deck = e.dataTransfer.getData('application/x-rg-deck');
      if (item !== '') App.moveItem(parseInt(item, 10), at);
      else if (song) App.addSong(parseInt(song, 10), at);
      else if (media) App.addMediaItem(JSON.parse(media), at);
      else if (deck) App.addItem(JSON.parse(deck), at);
    });
  }

  App.addMediaItem = (m, at) => {
    const item = App.addItem({ type: 'media', title: m.name, rel: m.rel_path, mediaType: m.type }, at);
    App.setPreview(item, App.service.items.indexOf(item), 0);
  };

  App.newService = async () => {
    if (App.dirty && App.service.items.length && !confirm('Start a new service? Unsaved changes to this one will be lost.')) return;
    App.service = { id: null, name: 'Untitled service', items: [] };
    App.dirty = false;
    App.preview = null;
    App.renderServiceName();
    App.renderSchedule();
    $('#previewSlides').innerHTML = '';
    $('#previewTitle').textContent = '';
    App.previewStage.show({ mode: 'blank', transition: { type: 'cut' } });
    rg.invoke('service:autosave', { service: App.service, dirty: false });
  };

  App.saveService = async (asNew) => {
    let name = App.service.name;
    if (!App.service.id || asNew || name === 'Untitled service') {
      name = await App.prompt('Save service', 'Service name', name === 'Untitled service' ? `Service ${new Date().toLocaleDateString()}` : name);
      if (!name) return;
    }
    App.service.name = name;
    App.service.id = await rg.invoke('services:save', { id: asNew ? null : App.service.id, name, data: { items: App.service.items } });
    App.dirty = false;
    App.renderServiceName();
    rg.invoke('service:autosave', { service: App.service, dirty: false });
    App.toast('Service saved');
    if (window.Library) Library.loadServices();
  };

  App.openService = async (id) => {
    const svc = await rg.invoke('services:get', id);
    if (!svc) return;
    if (App.dirty && App.service.items.length && !confirm('Open this service? Unsaved changes to the current one will be lost.')) return;
    App.service = { id: svc.id, name: svc.name, items: svc.data.items || [] };
    App.dirty = false;
    App.renderServiceName();
    App.renderSchedule();
    if (App.service.items[0]) App.setPreview(App.service.items[0], 0, 0);
    App.toast(`Opened “${svc.name}”`);
  };

  // ---------- keyboard ----------
  function setupKeys() {
    document.addEventListener('keydown', (e) => {
      const inField = e.target.matches('input, textarea, select, [contenteditable]');
      const modal = document.querySelector('.modal');
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); return App.saveService(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); return Dialogs.openService(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); return App.newService(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); return $('#search').focus(); }
      // F2 names the line of the service that is in Preview, the way a file is renamed anywhere.
      if (e.key === 'F2' && App.preview && App.preview.index != null) {
        e.preventDefault();
        return App.renameItem(App.preview.index);
      }
      // The web browser, on its own window and never on the projector.
      if (e.key === 'F1') { e.preventDefault(); return App.openGuide(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); return rg.invoke('web:open'); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); return Dialogs.ask(); }
      // Text size works even while typing in the library search, so it is always to hand.
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); return App.nudgeTextScale(1); }
      if (e.ctrlKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); return App.nudgeTextScale(-1); }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); return App.setTextScale(1); }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); return Dialogs.printService(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); return Dialogs.quickFind(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); return App.toggleAlert(); }
      if (modal || inField) {
        if (inField && e.key === 'Escape') e.target.blur();
        return;
      }
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': case ' ': case 'ArrowDown': e.preventDefault(); App.next(); break;
        case 'ArrowLeft': case 'PageUp': case 'ArrowUp': e.preventDefault(); App.prev(); break;
        case 'Enter': e.preventDefault(); App.goLive(); break;
        case 'b': case 'B': case '.': App.setCover('black'); break;
        case 'c': case 'C': App.setCover('clear'); break;
        case 'l': case 'L': App.setCover('logo'); break;
        case 'r': case 'R': App.jumpToChorus(); break;
        case ']': App.continueReading(); break;
        case 'k': case 'K': if (App.liveVideo()) App.setMediaPlayback({ paused: !App.mediaPlayback.paused }); break;
        case 'm': case 'M': if (App.liveVideo()) App.setMediaPlayback({ sound: !App.mediaPlayback.sound }); break;
        case '+': case '=': App.nudgeTextScale(1); break;
        case '-': case '_': App.nudgeTextScale(-1); break;
        case 'Escape': App.cover = null; App.sendLive(); break;
        default:
          if (/^[1-9]$/.test(e.key)) App.jumpToVerse(parseInt(e.key, 10));
      }
    });
  }

  // ---------- splitters ----------
  function setupSplitters() {
    const ws = $('#workspace');
    const saved = (() => { try { return JSON.parse(localStorage.getItem('rg.layout') || '{}'); } catch (_) { return {}; } })();
    /**
     * Panel sizes saved on one screen must not break the layout on another: a church that set
     * these up on an office monitor and then carries the laptop to the hall would otherwise
     * find the library squeezed to nothing, or the schedule wider than the window.
     */
    const clamp = () => {
      const w = ws.clientWidth || window.innerWidth;
      const h = ws.clientHeight || window.innerHeight;
      const px = (k, fallback) => parseFloat(ws.style.getPropertyValue(k)) || fallback;
      const schedule = Math.max(200, Math.min(px('--schedule-w', 300), Math.round(w * 0.34)));
      const preview = Math.max(300, Math.min(px('--preview-w', 520), Math.round(w - schedule - 300)));
      const library = Math.max(170, Math.min(px('--library-h', 280), Math.round(h - 300)));
      ws.style.setProperty('--schedule-w', `${Math.round(schedule)}px`);
      ws.style.setProperty('--preview-w', `${Math.round(preview)}px`);
      ws.style.setProperty('--library-h', `${Math.round(library)}px`);
    };
    for (const [k, v] of Object.entries(saved)) ws.style.setProperty(k, v);
    clamp();
    // And again whenever the window changes shape, including moving to the projector screen.
    window.addEventListener('resize', () => {
      clamp();
      App.liveStage.refit();
      App.previewStage.refit();
    });
    $$('.splitter').forEach((sp) => {
      // Double-click a divider to put it back where it started.
      sp.addEventListener('dblclick', () => {
        const kind = sp.dataset.split;
        if (kind === 'schedule') ws.style.removeProperty('--schedule-w');
        if (kind === 'preview') ws.style.removeProperty('--preview-w');
        if (kind === 'library') ws.style.removeProperty('--library-h');
        try { localStorage.removeItem('rg.layout'); } catch (_) { /* storage unavailable */ }
        App.liveStage.refit();
        App.previewStage.refit();
      });
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault();
        sp.classList.add('dragging');
        const kind = sp.dataset.split;
        const rect = ws.getBoundingClientRect();
        const move = (ev) => {
          if (kind === 'schedule') ws.style.setProperty('--schedule-w', Math.max(220, Math.min(520, ev.clientX - rect.left - 8)) + 'px');
          if (kind === 'preview') {
            const left = $('#previewPanel').getBoundingClientRect().left;
            ws.style.setProperty('--preview-w', Math.max(320, ev.clientX - left) + 'px');
          }
          if (kind === 'library') ws.style.setProperty('--library-h', Math.max(180, Math.min(rect.height - 280, rect.bottom - ev.clientY - 8)) + 'px');
          App.liveStage.refit();
          App.previewStage.refit();
        };
        const up = () => {
          sp.classList.remove('dragging');
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          const out = {};
          for (const k of ['--schedule-w', '--preview-w', '--library-h']) if (ws.style.getPropertyValue(k)) out[k] = ws.style.getPropertyValue(k);
          try { localStorage.setItem('rg.layout', JSON.stringify(out)); } catch (_) { /* storage unavailable */ }
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
    });
  }

  App.setWindowsState = (st) => {
    // Frame the monitors and thumbnails like the screen the output goes to.
    if (st.outputAspect > 0) {
      RGRender.setAspect(st.outputAspect);
      document.documentElement.style.setProperty('--out-aspect', st.outputAspect.toFixed(4));
    }
    const strip = $('#webLive');
    if (strip) strip.hidden = !st.webOnScreen;
    $('#btnOutput').classList.toggle('on', !!st.output);
    $('#btnStage').classList.toggle('on', !!st.stage);
    const second = st.displays && st.displays.length > 1;
    $('#btnOutput').title = st.output
      ? second ? 'Audience output is on (click to turn off)' : 'Output is showing in a window: connect a projector/TV to present full-screen'
      : 'Audience output is off (click to turn on)';
  };

  /** The music transport under Live: visible only while something is playing. */
  function setupMusic() {
    const bar = $('#musicBar');
    const vol = $('#musicVol');
    if (!bar || !window.RGMusic) return;
    vol.value = Math.round((App.settings.musicVolume ?? 0.7) * 100);
    vol.addEventListener('input', () => RGMusic.setVolume(vol.value / 100));
    RGMusic.onChange((s) => {
      bar.hidden = !s.playing && !s.paused;
      $('#musicName').textContent = s.name;
      $('#btnMusicPlay').innerHTML = s.paused ? '&#9654;' : '&#10074;&#10074;';
      $('#btnMusicPlay').title = s.paused ? 'Play the music' : 'Pause the music';
      $('#btnMusicLoop').classList.toggle('on', s.loop);
      if (document.activeElement !== vol) vol.value = Math.round(s.volume * 100);
    });
  }

  /**
   * Files dragged in from Explorer.
   *
   * A church gets this week's notices on a memory stick, or a photograph over WhatsApp, and
   * the shortest path from there to the screen should be dropping it on the window. Pictures,
   * videos and music go into Media; a PowerPoint or a PDF is imported as a presentation.
   */
  function setupFileDrop() {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const isFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');

    window.addEventListener('dragover', (e) => {
      if (!isFiles(e)) return;
      stop(e);
      e.dataTransfer.dropEffect = 'copy';
      document.body.classList.add('file-drop');
    });
    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget) return;
      document.body.classList.remove('file-drop');
    });
    window.addEventListener('drop', async (e) => {
      if (!isFiles(e)) return;
      stop(e);
      document.body.classList.remove('file-drop');
      const paths = [...e.dataTransfer.files].map((f) => window.rgFilePath(f)).filter(Boolean);
      if (!paths.length) return;

      App.toast(paths.length === 1 ? 'Bringing that file in…' : `Bringing ${paths.length} files in…`);
      try {
        const r = await rg.invoke('media:add-paths', paths);
        const bits = [];
        if (r.added.length) bits.push(`${r.added.length} in Media`);
        if (r.decks.length) bits.push(`${r.decks.length} ${r.decks.length === 1 ? 'presentation' : 'presentations'}`);
        if (bits.length) App.toast(bits.join(' · '));
        for (const s of r.skipped) App.toast(`${s.file}: ${s.message}`, true);
        if (window.Library) {
          if (r.added.length) Library.loadMedia();
          if (r.decks.length) Library.loadDecks();
        }
      } catch (err) {
        App.toast(App.errorText(err), true);
      }
    });
  }

  App.initCore = () => {
    App.previewStage = RGRender.createStage($('#previewMonitor'), { noTransitions: true });
    App.liveStage = RGRender.createStage($('#liveMonitor'));
    App.previewStage.show({ mode: 'blank', transition: { type: 'cut' } });
    App.liveStage.show({ mode: 'blank', cover: 'black', transition: { type: 'cut' } });
    setupScheduleDnD();
    setupKeys();
    setupSplitters();
    setupMusic();
    setupFileDrop();
    $('#textScale').textContent = `${Math.round((App.settings.textScale || 1) * 100)}%`;
    $('#autoSecs').value = App.settings.autoAdvanceSeconds || 8;
    $('#autoSecs').addEventListener('change', () => {
      rg.invoke('settings:set', { autoAdvanceSeconds: parseInt($('#autoSecs').value, 10) || 8 });
      App.restartAuto();
    });
    $('#transitionSelect').value = App.settings.transition && App.settings.transition.type === 'cut' ? 'cut' : 'fade';
  };
})();
