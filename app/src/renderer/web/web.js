// The one box above the page. Typing in it searches, or goes to an address — the main process
// decides which, so the browser and the command box agree about what "anglican.or.ke" means.
(() => {
  const $ = (id) => document.getElementById(id);
  const q = $('q'), bar = $('bar'), note = $('note');
  let editing = false;

  const show = (message) => {
    note.textContent = message;
    note.hidden = false;
    clearTimeout(show.timer);
    show.timer = setTimeout(() => { note.hidden = true; }, 4000);
  };

  $('go').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = q.value.trim();
    if (!value) return;
    editing = false;
    q.blur();
    rg.invoke('web:navigate', value);
  });

  // Putting the page on the projector, and taking it off again. The button says which it
  // will do, and goes red while a congregation is looking at the page.
  const showBtn = $('show');
  let onScreen = false;
  const setShowing = (state) => {
    onScreen = !!(state && state.showing);
    showBtn.classList.toggle('on', onScreen);
    showBtn.textContent = onScreen ? 'Take it off the screen' : 'Show on screen';
  };
  showBtn.addEventListener('click', async () => {
    try {
      setShowing(await rg.invoke(onScreen ? 'web:hide' : 'web:show'));
    } catch (e) {
      show(String((e && e.message) || e).replace(/^Error: /, ''));
    }
  });
  rg.invoke('web:audience').then(setShowing).catch(() => {});

  $('back').addEventListener('click', () => rg.invoke('web:back'));
  $('forward').addEventListener('click', () => rg.invoke('web:forward'));
  $('reload').addEventListener('click', () => rg.invoke('web:reload'));
  $('close').addEventListener('click', () => rg.invoke('web:close'));

  q.addEventListener('focus', () => { editing = true; q.select(); });
  q.addEventListener('blur', () => { editing = false; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (editing) { q.blur(); return; }
      rg.invoke('web:close');
    }
    // Ctrl+L / Ctrl+E: back to the box, the way every browser does it.
    if ((e.ctrlKey || e.metaKey) && ['l', 'e'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      q.focus();
    }
  });

  rg.on('web:state', (s) => {
    $('back').disabled = !s.canGoBack;
    $('forward').disabled = !s.canGoForward;
    bar.style.width = s.loading ? '70%' : '0';
    // Never fight the operator for the box while they are typing in it.
    if (!editing && s.url && !s.url.startsWith('data:')) q.value = prettyUrl(s.url);
  });

  rg.on('web:error', (message) => show(message));

  function prettyUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'duckduckgo.com' && u.searchParams.get('q')) return u.searchParams.get('q');
      return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
    } catch { return url; }
  }

  // The search box is where an operator's hands already are.
  window.addEventListener('DOMContentLoaded', () => q.focus());
  q.focus();
})();
