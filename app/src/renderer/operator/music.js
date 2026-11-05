/*
 * Music.
 *
 * Pre-service music, something under a reflection, a track behind the notices. It is nothing
 * like a video: it has nothing to show, and it must carry on while the operator moves through
 * slides, takes a reading live and blacks the screen. So it plays here, in the operator window,
 * which lives for the whole service — not in the audience window, which is created and
 * destroyed as the projector comes and goes, and which would cut the music off every time.
 *
 * It fades in and out rather than starting and stopping flat, because a congregation hears a
 * sudden cut as a mistake.
 */
(function () {
  const M = {};
  window.RGMusic = M;

  const FADE_MS = 1200;
  const audio = new Audio();
  audio.preload = 'none';
  let current = null; // the media row now playing
  let fading = null;
  let listeners = [];

  const settings = () => App.settings || {};
  const wanted = () => {
    const v = settings().musicVolume;
    return typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 0.7;
  };

  const tell = () => listeners.forEach((fn) => fn(M.state()));

  M.onChange = (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((f) => f !== fn); }; };

  M.state = () => ({
    playing: !!current && !audio.paused,
    paused: !!current && audio.paused,
    name: current ? current.name : '',
    rel: current ? current.rel_path : '',
    loop: audio.loop,
    volume: wanted(),
    position: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  });

  /** Ramp the volume; resolves when it gets there. */
  function fadeTo(target, ms) {
    clearInterval(fading);
    return new Promise((resolve) => {
      const from = audio.volume;
      const started = Date.now();
      if (ms <= 0 || from === target) { audio.volume = target; return resolve(); }
      fading = setInterval(() => {
        const t = Math.min(1, (Date.now() - started) / ms);
        audio.volume = from + (target - from) * t;
        if (t >= 1) { clearInterval(fading); fading = null; resolve(); }
      }, 40);
    });
  }

  /** Start a track. Anything already playing is faded out first. */
  M.play = async (media, { fade = true } = {}) => {
    if (!media || media.type !== 'audio') return;
    if (current && current.rel_path === media.rel_path && !audio.paused) return;
    if (current) await fadeTo(0, fade ? FADE_MS / 2 : 0);

    current = media;
    audio.src = RGRender.mediaUrl(media.rel_path);
    audio.loop = !!settings().musicLoop;
    audio.volume = fade ? 0 : wanted();
    try {
      await audio.play();
    } catch (e) {
      App.toast(`That music would not play: ${e.message}`, true);
      current = null;
      tell();
      return;
    }
    if (fade) await fadeTo(wanted(), FADE_MS);
    tell();
  };

  M.pause = async () => {
    if (!current || audio.paused) return;
    await fadeTo(0, FADE_MS / 2);
    audio.pause();
    tell();
  };

  M.resume = async () => {
    if (!current || !audio.paused) return;
    audio.volume = 0;
    await audio.play().catch(() => {});
    await fadeTo(wanted(), FADE_MS / 2);
    tell();
  };

  /** Stop and let go of the track, fading out so nobody hears a cut. */
  M.stop = async ({ fade = true } = {}) => {
    if (!current) return;
    if (fade) await fadeTo(0, FADE_MS);
    audio.pause();
    audio.currentTime = 0;
    current = null;
    tell();
  };

  M.setVolume = async (v) => {
    const value = Math.min(1, Math.max(0, v));
    App.settings = await rg.invoke('settings:set', { musicVolume: value });
    if (current && !audio.paused) await fadeTo(value, 120);
    tell();
  };

  M.toggleLoop = async () => {
    audio.loop = !audio.loop;
    App.settings = await rg.invoke('settings:set', { musicLoop: audio.loop });
    tell();
  };

  audio.addEventListener('ended', () => { if (!audio.loop) { current = null; tell(); } });
  audio.addEventListener('timeupdate', () => tell());
  audio.addEventListener('error', () => {
    if (!current) return;
    App.toast(`“${current.name}” could not be played`, true);
    current = null;
    tell();
  });

  /*
   * Nothing plays on by itself into a service: when a song or a reading goes live, music that
   * was covering the silence before it has done its job. The operator can turn that off.
   */
  M.liveStarted = () => {
    if (!current || audio.paused) return;
    if (settings().musicStopOnLive === false) return;
    M.stop({ fade: true });
  };
})();
