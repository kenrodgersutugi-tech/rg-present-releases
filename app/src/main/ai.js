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

module.exports = { generateBackground, buildPrompt, firstImage, errorFrom, MODEL, ENDPOINT };
