/**
 * Styling a few words inside a line of a song.
 *
 * A church wants one line in red, a name in italic, a refrain in a different face — without
 * giving up the plain lyrics everything else in RG-Present depends on. So the styling lives
 * inside the text as small tags, and every other part of the program keeps seeing words:
 *
 *     Holy, {c:#ffd166}holy{/c}, {i}holy{/i}
 *
 * Tags:   {b}bold{/b}  {i}italic{/i}  {u}underline{/u}
 *         {c:#rrggbb}colour{/c}   {f:Georgia}face{/f}   {s:130}per cent of the size{/s}
 *
 * Unknown or unclosed tags are shown as the words they wrap rather than swallowing the line:
 * a malformed tag must never blank a slide in front of a congregation.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RGRich = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const OPEN = /\{(b|i|u|c|f|s)(?::([^}]{1,40}))?\}/i;
  const CLOSE_OF = (tag) => new RegExp(`\\{\\/${tag}\\}`, 'i');

  /** True when the text has any styling in it at all. */
  function hasStyling(text) {
    return OPEN.test(String(text || ''));
  }

  /** The words alone, for searching, printing, exporting and the stage display. */
  function strip(text) {
    return String(text || '').replace(/\{\/?(?:b|i|u|c|f|s)(?::[^}]{1,40})?\}/gi, '');
  }

  /**
   * Split text into runs of {text, style}. Style keys: bold, italic, underline, colour,
   * family, size (per cent).
   */
  function parse(text) {
    const source = String(text == null ? '' : text);
    const runs = [];
    let rest = source;
    let style = {};
    const stack = [];

    const push = (chunk) => {
      if (!chunk) return;
      const last = runs[runs.length - 1];
      if (last && sameStyle(last.style, style)) last.text += chunk;
      else runs.push({ text: chunk, style: { ...style } });
    };

    while (rest.length) {
      const open = OPEN.exec(rest);
      const closeAt = stack.length ? rest.search(CLOSE_OF(stack[stack.length - 1].tag)) : -1;

      // Whichever comes first: an opening tag, or the closing tag we are waiting for.
      if (open && (closeAt < 0 || open.index < closeAt)) {
        push(rest.slice(0, open.index));
        const [whole, tag, value] = open;
        const lower = tag.toLowerCase();
        const next = { ...style };
        if (lower === 'b') next.bold = true;
        else if (lower === 'i') next.italic = true;
        else if (lower === 'u') next.underline = true;
        else if (lower === 'c' && isColour(value)) next.colour = value;
        else if (lower === 'f' && value) next.family = value.slice(0, 40);
        else if (lower === 's' && /^\d{2,3}$/.test(value || '')) next.size = Math.max(40, Math.min(300, +value));
        stack.push({ tag: lower, before: style });
        style = next;
        rest = rest.slice(open.index + whole.length);
        continue;
      }

      if (closeAt >= 0) {
        push(rest.slice(0, closeAt));
        const closing = stack.pop();
        style = closing ? closing.before : {};
        rest = rest.slice(closeAt + `{/${closing.tag}}`.length);
        continue;
      }

      push(rest);
      break;
    }

    return runs.length ? runs : [{ text: '', style: {} }];
  }

  /**
   * Put the text into an element as styled spans. Line breaks stay line breaks, because a
   * hymn's lines are its shape.
   */
  function render(el, text, baseSize) {
    el.textContent = '';
    if (!hasStyling(text)) {
      el.textContent = String(text == null ? '' : text);
      return;
    }
    for (const run of parse(text)) {
      const parts = run.text.split('\n');
      parts.forEach((part, i) => {
        if (i) el.appendChild(document.createElement('br'));
        if (!part) return;
        const span = document.createElement('span');
        span.textContent = part;
        const s = run.style;
        if (s.bold) span.style.fontWeight = '800';
        if (s.italic) span.style.fontStyle = 'italic';
        if (s.underline) span.style.textDecoration = 'underline';
        if (s.colour) span.style.color = s.colour;
        // Quoted, so a family with spaces works and nothing can break out of the declaration.
        if (s.family) span.style.fontFamily = `"${String(s.family).replace(/["\;{}]/g, '')}"`;
        if (s.size) span.style.fontSize = `${s.size}%`;
        el.appendChild(span);
      });
    }
  }

  /** Wrap a stretch of text in a tag — what the editor's buttons do to the selection. */
  function wrap(text, start, end, tag, value) {
    const chosen = text.slice(start, end);
    if (!chosen) return null;
    const open = value ? `{${tag}:${value}}` : `{${tag}}`;
    const close = `{/${tag}}`;
    return {
      text: text.slice(0, start) + open + chosen + close + text.slice(end),
      start: start + open.length,
      end: end + open.length,
    };
  }

  /** Take every tag off a stretch of text, for when it has been styled into a corner. */
  function clear(text, start, end) {
    const chosen = strip(text.slice(start, end));
    return { text: text.slice(0, start) + chosen + text.slice(end), start, end: start + chosen.length };
  }

  function isColour(value) {
    return /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function sameStyle(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return { hasStyling, strip, parse, render, wrap, clear };
});
