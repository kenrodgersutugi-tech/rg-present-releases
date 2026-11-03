// Background pictures made to order, using the church's own Gemini key.
//
// Entirely optional, and off until a church puts a key in. RG-Present works with no internet
// (principle: a service must never depend on a connection), so this sits beside the library
// rather than inside the service: a picture is generated, saved into Media like any other, and
// from then on it is a file on the church's computer that needs nothing.
//
// The key belongs to the church. It is kept in their own settings file, sent to Google and
// nowhere else, and never written to a log.
const { net } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { paths } = require('./store');

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Where to ask. Google's own service, unless a development run points this at a stand-in —
 * a packaged build ignores the variable, so no church installation can be redirected.
 */
function endpoint() {
  const { app } = require('electron');
  if (!app.isPackaged && process.env.RG_AI_ENDPOINT) return process.env.RG_AI_ENDPOINT;
  return DEFAULT_ENDPOINT;
}

const ENDPOINT = DEFAULT_ENDPOINT;
const MODEL = 'gemini-nano-banana-2.1';
const API_REVISION = '2026-05-20';

/**
 * What to ask for. A projected background is a particular kind of picture: the words go on top,
 * so the middle has to stay quiet, and it is seen from the back of a hall in a dim room.
 */
function buildPrompt(theme, style) {
  const looks = {
    photo: 'a photograph, natural light, realistic',
    painted: 'a soft painted illustration, gentle brushwork',
    abstract: 'an abstract background of light, colour and texture, no recognisable objects',
    landscape: 'a wide landscape photograph, distant horizon',
  }[style] || 'a photograph, natural light, realistic';

  return [
    `A background image for a church worship projection screen on the theme "${theme}".`,
    looks + '.',
    'Composition: the centre of the frame is calm and uncluttered so that large white words can',
    'be read over it; interest sits towards the edges and corners.',
    'Dark enough for white text to stand out, rich but not garish, no harsh bright spots in the middle.',
    'Absolutely no text, no lettering, no words, no logos, no watermarks, and no people looking',
    'at the camera.',
    'Reverent and welcoming in feeling; suitable for a congregation of any age.',
  ].join(' ');
}

/** Pull the first image out of whatever shape the response comes back in. */
function firstImage(body) {
  const seen = [];
  const walk = (node, depth) => {
    if (!node || depth > 8 || seen.length) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    // The documented shape: a model_output step whose content blocks carry base64 in `data`.
    if ((node.type === 'image' || node.mimeType || node.mime_type) && typeof node.data === 'string' && node.data.length > 256) {
      seen.push({ data: node.data, mime: node.mimeType || node.mime_type || 'image/png' });
      return;
    }
    // The older generateContent shape, in case a key is pointed at it.
    if (node.inlineData && typeof node.inlineData.data === 'string') {
      seen.push({ data: node.inlineData.data, mime: node.inlineData.mimeType || 'image/png' });
      return;
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  walk(body, 0);
  return seen[0] || null;
}

/** Whatever Google said went wrong, in words an operator can act on. */
function errorFrom(status, body) {
  const message = (body && ((body.error && body.error.message) || body.message)) || '';
  if (/api[_ ]?key|api key not valid|unauthenticat/i.test(message) || status === 400) {
    return message && !/api[_ ]?key/i.test(message)
      ? `Google refused: ${message}`
      : 'That Gemini key was not accepted. Check it in Settings — copy it again from aistudio.google.com.';
  }
  if (status === 401 || status === 403) return 'That Gemini key is not allowed to generate images. Check the key and that billing is enabled on it.';
  if (status === 429) {
    // The usual case is not a burst of requests: it is a key on Google's free tier, which
    // allows no image generation at all. Say so, because waiting will never fix it.
    if (/free tier|limit: ?0|upgrade your tier/i.test(message)) {
      return 'That Google account is on the free tier, which cannot generate images at all. '
        + 'Turn on billing for the key at ai.dev/rate-limit, or carry on using your own pictures — '
        + 'everything else in RG-Present works without it.';
    }
    return 'Google is rate-limiting that key. Wait a minute and try again.';
  }
  if (status >= 500) return 'Google had a problem generating the picture. Try again in a moment.';
  return message ? `Google refused: ${message}` : `Google returned ${status}.`;
}

/**
 * Generate one background and keep it in the media library.
 *
 * Returns the media row to add; throws an Error whose message is meant to be read by the
 * person at the desk.
 */
async function generateBackground({ apiKey, theme, style, aspect }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Put your Gemini key into Settings first.');
  if (!String(theme || '').trim()) throw new Error('Type the theme of the service first.');

  let response;
  try {
    response = await net.fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
        'Api-Revision': API_REVISION,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: 'text', text: buildPrompt(theme, style) }],
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: aspect || '16:9',
          image_size: '2K',
        },
      }),
    });
  } catch (e) {
    throw new Error('Could not reach Google. Check the internet connection.');
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }
  if (!response.ok) throw new Error(errorFrom(response.status, body));

  const image = firstImage(body);
  if (!image) throw new Error('Google replied without a picture. Try wording the theme differently.');

  const extension = /jpe?g/i.test(image.mime) ? '.jpg' : '.png';
  const slug = String(theme).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'background';
  const name = `${slug}-${crypto.randomBytes(3).toString('hex')}${extension}`;
  const dir = path.join(paths.media, 'user');
  fs.mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length < 1024) throw new Error('The picture came back empty. Try again.');
  fs.writeFileSync(path.join(dir, name), bytes);

  return {
    name: String(theme).trim().slice(0, 60),
    rel_path: `user/${name}`,
    type: 'image',
    folder: 'Generated',
    bytes: bytes.length,
  };
}

// ---------------------------------------------------------------- asking in words

/**
 * The text side of the same key.
 *
 * Images need a paid Google account; text does not, so these work for any church with a free
 * key — and they are the more useful half anyway. Three rules hold throughout:
 *
 *   1. **Scripture is never written by a machine.** The model is asked for a reference; the
 *      words come out of the church's own Bible. Nothing invented ever reaches the wall.
 *   2. **Songs are only ever chosen from the church's own library.** The model is given the
 *      titles it may choose between and must answer with their ids; anything else is dropped.
 *   3. **Nothing happens by itself.** Every one of these is a button an operator presses, and
 *      what comes back is a suggestion they can see before anything reaches the screen.
 */
const TEXT_MODEL = 'gemini-2.5-flash';

function textEndpoint() {
  const { app } = require('electron');
  if (!app.isPackaged && process.env.RG_AI_TEXT_ENDPOINT) return process.env.RG_AI_TEXT_ENDPOINT;
  return `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`;
}

/** Ask for JSON and get JSON back, whatever decoration the model puts round it. */
async function askJson({ apiKey, prompt, maxTokens }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Put your Gemini key into Settings first.');

  let response;
  try {
    response = await net.fetch(textEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens || 2048,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (e) {
    throw new Error('Could not reach Google. Check the internet connection.');
  }

  let body = null;
  try { body = await response.json(); } catch (_) { body = null; }
  if (!response.ok) throw new Error(errorFrom(response.status, body));

  const parts = ((((body || {}).candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Google replied with nothing. Try asking differently.');

  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // One rescue attempt: the first well-formed object or array inside the reply.
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (__) { /* falls through */ }
    }
    throw new Error('Google replied in a shape RG-Present could not read. Try again.');
  }
}

/**
 * Find songs in the church's own library.
 *
 * The model is given a shortlist and must answer with ids from it, so it cannot suggest a hymn
 * the church does not have. Anything it invents is dropped on the way back.
 */
async function findSongs({ apiKey, query, candidates }) {
  const list = candidates.slice(0, 1200)
    .map((s) => `${s.id}|${[s.number, s.title, s.alt_title, s.folder].filter(Boolean).join(' · ')}`)
    .join('\n');

  const answer = await askJson({
    apiKey,
    maxTokens: 1024,
    prompt: [
      'You are helping a church operator find hymns in their own library.',
      `They asked for: "${query}"`,
      '',
      'These are the only songs they have. Each line is "id|number · title · also-known-as · folder":',
      list,
      '',
      'Choose up to 6 that best fit what they asked for. Prefer the ones whose words really suit',
      'the occasion or theme, not merely a title that shares a word.',
      'Answer as JSON: {"songs":[{"id":<number>,"why":"<at most 12 words>"}]}',
      'Use only ids from the list. If nothing fits, answer {"songs":[]}.',
    ].join('\n'),
  });

  const allowed = new Set(candidates.map((s) => String(s.id)));
  return (answer.songs || [])
    .filter((s) => allowed.has(String(s.id)))
    .slice(0, 6)
    .map((s) => ({ id: Number(s.id), why: String(s.why || '').slice(0, 80) }));
}

/**
 * Find a reading from a description. The model returns references only — "Proverbs 22:6" — and
 * the words are then read out of the church's own Bible, so nothing it imagines is shown.
 */
async function findReadings({ apiKey, query }) {
  const answer = await askJson({
    apiKey,
    maxTokens: 700,
    prompt: [
      'A church operator is looking for a Bible passage.',
      `They described it as: "${query}"`,
      '',
      'Give up to 5 passages that match, most likely first.',
      'Answer as JSON: {"readings":[{"reference":"Book Chapter:Verse-Verse","why":"<at most 12 words>"}]}',
      'Use ordinary English book names as they appear in the King James Version.',
      'Keep each passage short enough to read aloud in a service — a few verses, not a whole chapter.',
    ].join('\n'),
  });

  return (answer.readings || [])
    .slice(0, 5)
    .map((r) => ({ reference: String(r.reference || '').slice(0, 60), why: String(r.why || '').slice(0, 80) }))
    .filter((r) => r.reference);
}

/** An order of service built round a theme, out of the hymns the church actually has. */
async function planService({ apiKey, theme, candidates }) {
  const list = candidates.slice(0, 900)
    .map((s) => `${s.id}|${[s.number, s.title, s.folder].filter(Boolean).join(' · ')}`)
    .join('\n');

  const answer = await askJson({
    apiKey,
    maxTokens: 1400,
    prompt: [
      `A church is planning a service on the theme "${theme}".`,
      '',
      'These are the hymns they have ("id|number · title · folder"):',
      list,
      '',
      'Build an order of service with a heading before each part. Use between 6 and 10 lines in all.',
      'Hymns must be chosen from the list by id. Readings are Bible references only.',
      'Answer as JSON:',
      '{"plan":[{"kind":"heading","title":"Opening"},',
      ' {"kind":"song","id":<number>,"why":"<a few words>"},',
      ' {"kind":"reading","reference":"John 3:16-18","why":"<a few words>"},',
      ' {"kind":"note","title":"Notices","text":"<one line>"}]}',
      'Order it as a service runs: gathering, readings, sermon, response, sending out.',
    ].join('\n'),
  });

  const allowed = new Set(candidates.map((s) => String(s.id)));
  return (answer.plan || [])
    .slice(0, 14)
    .filter((row) => row && row.kind)
    .filter((row) => row.kind !== 'song' || allowed.has(String(row.id)));
}

/** Notes, notices or an outline turned into slides a congregation can read. */
async function notesToSlides({ apiKey, notes }) {
  const answer = await askJson({
    apiKey,
    maxTokens: 1600,
    prompt: [
      'Turn these notes into slides for a church projector.',
      '',
      notes.slice(0, 6000),
      '',
      'Rules a projected slide must follow:',
      '- at most 5 short lines on a slide, and at most about 8 words on a line;',
      '- plain words a whole congregation can read from the back of the hall;',
      '- keep names, dates, times and places exactly as written;',
      '- do not invent anything that is not in the notes.',
      'Answer as JSON: {"slides":[{"label":"<short name>","lines":["line","line"]}]}',
    ].join('\n'),
  });

  return (answer.slides || [])
    .slice(0, 20)
    .map((s) => ({
      label: String(s.label || 'Slide').slice(0, 40),
      lines: (Array.isArray(s.lines) ? s.lines : []).slice(0, 8).map((l) => String(l).slice(0, 120)),
    }))
    .filter((s) => s.lines.length);
}

module.exports = {
  generateBackground, buildPrompt, firstImage, errorFrom, MODEL, ENDPOINT,
  askJson, findSongs, findReadings, planService, notesToSlides, TEXT_MODEL,
};
