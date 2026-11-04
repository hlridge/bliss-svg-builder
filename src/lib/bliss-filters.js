/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// A CSS `filter` written inside the picture, drawn as a native SVG <filter>
// so it looks the same in every browser and PNG converter (GH #34). Pure
// functions over the escaped text the markup carries (escapeHtml): a quote is
// `&quot;` or `&#39;` and every `&` begins an escape, so text copied from a
// value into an attribute is as safe there as the value was. The element tree
// and the builder call it where they write an element's attributes; it
// imports neither.
//
// A value is translated only when it is exactly what the primitives
// reproduce: a list of the ten filter functions, in absolute lengths. Any
// other value is kept as written, silently, as the library never judges a
// value it carries for CSS.

const KEPT = Object.freeze({ kind: 'kept' });

// Rounds a number the module writes as the tree and the builder round theirs
// (4 decimals), which removes the float noise of computed values.
const roundForMarkup = (num) => parseFloat(num.toFixed(4));

// A quoted string, read whole to its closing quote (or the end).
const QUOTED = String.raw`&quot;[^]*?(?:&quot;|$)|&#39;[^]*?(?:&#39;|$)`;
const STRING_OR_COMMENT = new RegExp(String.raw`${QUOTED}|/\*[^]*?(?:\*/|$)`, 'g');

// The text as CSS reads it, index for index: each comment outside quotes
// blanked to as many spaces, and CSS's other spacing (tab, the line breaks)
// turned into spaces, so a plain space is the only spacing left to read.
// Other Unicode spaces are not spacing in CSS and stay as written.
const readable = (text) => text
  .replace(STRING_OR_COMMENT, (match) => (match.startsWith('/*') ? ' '.repeat(match.length) : match))
  .replace(/[\t\n\r\f]/g, ' ');

const trimSpace = (text) => text.replace(/^ +| +$/g, '');

// What the style splitter steps over: a quoted string or an escape whole,
// else one character, so the `;` closing an escape is never a split.
const STYLE_TOKEN = new RegExp(String.raw`${QUOTED}|&[^;]*;|[^]`, 'g');

// A style's declarations, in order: each one's text as written, the same text
// as CSS reads it (`read`), the index of its first colon in it (-1 where it
// has none), and its property, read in any case with its spacing and comments
// removed ('' where it has no colon). Split at each `;` outside parentheses,
// quotes, escapes and comments, so the texts joined by `;` give the style
// back.
const declarationsOf = (style) => {
  const written = String(style);
  const reading = readable(written);
  const cuts = [];
  let depth = 0;
  let index = 0;
  for (const token of reading.match(STYLE_TOKEN) ?? []) {
    if (token === '(') depth++;
    else if (token === ')') depth = Math.max(0, depth - 1);
    else if (token === ';' && depth === 0) cuts.push(index);
    index += token.length;
  }
  return [0, ...cuts.map(cut => cut + 1)].map((start, i) => {
    const end = cuts[i] ?? written.length;
    const read = reading.slice(start, end);
    const colon = read.indexOf(':');
    const property = colon === -1 ? '' : trimSpace(read.slice(0, colon)).toLowerCase();
    return { property, text: written.slice(start, end), read, colon };
  });
};

/**
 * A style's declarations as `{ property, text }`, in order: the one reading
 * of a style that both the filter translation and an element background's
 * copy of its effects use.
 */
export const splitDeclarations = (style) =>
  declarationsOf(style).map(({ property, text }) => ({ property, text }));

// `!important` closing a declaration's value, in any case and spacing.
const IMPORTANT = /! *important *$/i;

// A `filter` declaration's value as readFilterValue reads it, `!important`
// read past, and whether it had one.
const declaredFilter = ({ text, read, colon }) => {
  const important = IMPORTANT.exec(read.slice(colon + 1));
  return { filter: readFilterValue(text.slice(colon + 1, important ? colon + 1 + important.index : undefined)), important };
};

/**
 * The style with each `filter` declaration that translates pointed at its
 * native filter in place: the property as written, then `:url(#id)`, then
 * `!important` where it had one. `allocate(read)` is called once per such
 * declaration, in order, with what readFilterValue read, and returns the id.
 * Every other declaration is left byte for byte.
 */
export const rewriteStyle = (style, allocate) => declarationsOf(style).map((declaration) => {
  if (declaration.property !== 'filter') return declaration.text;
  const { filter, important } = declaredFilter(declaration);
  if (filter.kind !== 'translated') return declaration.text;
  return `${declaration.text.slice(0, declaration.colon + 1)}url(#${allocate(filter)})${important ? '!important' : ''}`;
}).join(';');

// A CSS number, then a unit (letters) or a percent sign, or nothing.
const DIMENSION = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z]+|%)?$/i;

// A token as { number, unit }, the unit lowercased ('' where there is none),
// or null where it is not one finite number.
const readNumber = (token) => {
  const match = DIMENSION.exec(token);
  const number = match && Number(match[1]);
  return Number.isFinite(number) ? { number, unit: (match[2] ?? '').toLowerCase() } : null;
};

// Grid units per unit, at 96 px per inch (1px is one grid unit).
const LENGTH_UNITS = new Map([
  ['px', 1], ['in', 96], ['cm', 96 / 2.54], ['mm', 96 / 25.4], ['q', 96 / 101.6], ['pt', 4 / 3], ['pc', 16],
]);

// Degrees per unit.
const ANGLE_UNITS = new Map([['deg', 1], ['rad', 180 / Math.PI], ['grad', 0.9], ['turn', 360]]);

// A token in one of `units`, or a unitless 0, as a number of the first unit;
// null for anything else.
const measure = (token, units) => {
  const read = readNumber(token);
  if (read === null) return null;
  if (read.unit === '') return read.number === 0 ? 0 : null;
  return units.has(read.unit) ? read.number * units.get(read.unit) : null;
};

// A number, or a percentage as its hundredth; null for anything else.
const fractionOf = (token) => {
  const read = readNumber(token);
  if (read === null || (read.unit !== '' && read.unit !== '%')) return null;
  return read.unit === '%' ? read.number / 100 : read.number;
};

// An amount: a fraction that is not negative; null for anything else.
const amountOf = (token) => {
  const amount = fractionOf(token);
  return amount === null || amount < 0 ? null : amount;
};

// A call's arguments, split at spacing outside parentheses, so a color
// function stays one argument.
const argumentsOf = (text) => {
  const tokens = [];
  let depth = 0;
  let token = '';
  for (const char of text) {
    if (depth === 0 && char === ' ') {
      if (token !== '') tokens.push(token);
      token = '';
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    token += char;
  }
  if (token !== '') tokens.push(token);
  return tokens;
};

// The one argument of blur(), hue-rotate() and the amounts, read by `read`;
// `omitted` where there is none, null where there are more.
const soleArgument = (tokens, read, omitted) => {
  if (tokens.length > 1) return null;
  return tokens.length === 0 ? omitted : read(tokens[0]);
};

const transfer = (funcs) => `<feComponentTransfer>${funcs}</feComponentTransfer>`;
const rgbTransfer = (attributes) =>
  transfer(['R', 'G', 'B'].map(channel => `<feFunc${channel} ${attributes}/>`).join(''));
const colorMatrix = (values) => `<feColorMatrix type="matrix" values="${values.map(roundForMarkup).join(' ')}"/>`;

// Filter Effects 1's grayscale and sepia matrices, at `rest` = 1 - amount.
const grayscaleMatrix = (rest) => colorMatrix([
  0.2126 + 0.7874 * rest, 0.7152 - 0.7152 * rest, 0.0722 - 0.0722 * rest, 0, 0,
  0.2126 - 0.2126 * rest, 0.7152 + 0.2848 * rest, 0.0722 - 0.0722 * rest, 0, 0,
  0.2126 - 0.2126 * rest, 0.7152 - 0.7152 * rest, 0.0722 + 0.9278 * rest, 0, 0,
  0, 0, 0, 1, 0,
]);
const sepiaMatrix = (rest) => colorMatrix([
  0.393 + 0.607 * rest, 0.769 - 0.769 * rest, 0.189 - 0.189 * rest, 0, 0,
  0.349 - 0.349 * rest, 0.686 + 0.314 * rest, 0.168 - 0.168 * rest, 0, 0,
  0.272 - 0.272 * rest, 0.534 - 0.534 * rest, 0.131 + 0.869 * rest, 0, 0,
  0, 0, 0, 1, 0,
]);
// The matrix Filter Effects 1 gives `type="saturate"`, written out: resvg reads
// that type's value only from 0 to 1 and draws a larger one as no change.
const saturateMatrix = (amount) => colorMatrix([
  0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount, 0, 0,
  0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount, 0, 0,
  0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount, 0, 0,
  0, 0, 0, 1, 0,
]);

// A function that only recolors: its amount, clamped to `max` where CSS
// clamps it and rounded as written, drawn by `primitive`. It reaches nothing
// past the element.
const recolor = (primitive, max = Infinity) => (tokens) => {
  const amount = soleArgument(tokens, amountOf, 1);
  return amount === null ? null : { primitive: primitive(roundForMarkup(Math.min(amount, max))), reach: 0 };
};

const blur = (tokens) => {
  const radius = soleArgument(tokens, token => measure(token, LENGTH_UNITS), 0);
  if (radius === null || radius < 0) return null;
  const deviation = roundForMarkup(radius);
  return { primitive: `<feGaussianBlur stdDeviation="${deviation}"/>`, reach: 3 * deviation };
};

const hueRotate = (tokens) => {
  const angle = soleArgument(tokens, token => measure(token, ANGLE_UNITS), 0);
  return angle === null ? null : { primitive: `<feColorMatrix type="hueRotate" values="${roundForMarkup(angle)}"/>`, reach: 0 };
};

// Functions only CSS substitutes.
const SUBSTITUTION = /(?:var|env)\(/i;

// An rgb() or hsl() color (or its -a spelling) with no function inside.
const RGB_OR_HSL = /^(rgb|hsl)a?\(([^()]*)\)$/i;

// An rgb() or hsl() color's components, legacy (`0, 0, 0, 0.3`) or modern
// (`0 0 0 / 30%`), as { channels, alpha }, alpha undefined where none is
// written; null where they are not three channels and at most an alpha.
const colorParts = (inside) => {
  if (inside.includes(',')) {
    const parts = inside.split(',').map(trimSpace);
    return parts.length === 3 || parts.length === 4 ? { channels: parts.slice(0, 3), alpha: parts[3] } : null;
  }
  const [channels, alpha, ...rest] = inside.split('/');
  const split = trimSpace(channels).split(/ +/);
  if (split.length !== 3 || rest.length > 0) return null;
  return { channels: split, alpha: alpha === undefined ? undefined : trimSpace(alpha) };
};

// A channel of an rgb() or hsl() color: a number, or a percentage, or for the
// hue an angle.
const isChannel = (channel, isHue) => {
  const read = readNumber(channel);
  return read !== null && (read.unit === '' || (isHue ? ANGLE_UNITS.has(read.unit) : read.unit === '%'));
};

// A drop-shadow's color as `flood-color` takes it, or null where only CSS can
// read it (var() or env() anywhere in it). An rgb() or hsl() of plain channels
// is written in the comma form with a number alpha, clamped to 0..1 as CSS
// clamps it: the one form resvg draws translucent. Any other color, a word
// that is not one included, is copied as written.
const floodColor = (color) => {
  if (SUBSTITUTION.test(color)) return null;
  const match = RGB_OR_HSL.exec(color);
  const parts = match && colorParts(match[2]);
  if (!parts) return color;
  const name = match[1].toLowerCase();
  const alpha = parts.alpha === undefined ? undefined : fractionOf(parts.alpha);
  if (alpha === null || !parts.channels.every((channel, at) => isChannel(channel, name === 'hsl' && at === 0))) return color;
  return alpha === undefined
    ? `${name}(${parts.channels.join(',')})`
    : `${name}a(${parts.channels.join(',')},${roundForMarkup(Math.min(Math.max(alpha, 0), 1))})`;
};

// A token that begins as a number does, or as a call to one of CSS's math
// functions: a length (or a number), never a color.
const NUMERIC = /^(?:[+-]?\.?\d|(?:calc|min|max|clamp|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|abs|sign)\()/i;

// CSS's `drop-shadow( <color>? && <length>{2,3} )`: the color before or after
// the lengths, the third length a blur that is not negative. An omitted color
// is CSS's currentColor, where the flood alone would draw black.
//
// Drawn as Filter Effects 1's own equivalent in SVG 1.1 primitives, not as
// <feDropShadow>: a renderer without that primitive draws nothing at all of
// the element it filters (librsvg 2.52.8, which node-canvas's Linux build
// bundles). The shadow's input is named, blurred, offset, flooded with the
// color inside the offset's alpha, and merged under the input. The names carry
// the function's `place` in the value, so two shadows in one filter keep their
// inputs apart. A blur of 0 is left out, as SVG 1.1's first edition draws a
// zero blur as transparent black, which would lose the shadow.
const dropShadow = (tokens, place) => {
  const colorAt = [0, tokens.length - 1].find(at => at in tokens && !NUMERIC.test(tokens[at]));
  const lengths = tokens.filter((_, at) => at !== colorAt).map(token => measure(token, LENGTH_UNITS));
  if (lengths.length < 2 || lengths.length > 3 || lengths.includes(null) || lengths[2] < 0) return null;
  const flood = colorAt === undefined ? 'currentColor' : floodColor(tokens[colorAt]);
  if (flood === null) return null;
  const [dx, dy, deviation = 0] = lengths.map(roundForMarkup);
  const input = `shadow-input-${place}`;
  const offset = `shadow-offset-${place}`;
  return {
    primitive: `<feOffset result="${input}"/>`
      + (deviation === 0 ? '' : `<feGaussianBlur stdDeviation="${deviation}"/>`)
      + `<feOffset dx="${dx}" dy="${dy}" result="${offset}"/>`
      + `<feFlood flood-color="${flood}"/><feComposite in2="${offset}" operator="in"/>`
      + `<feMerge><feMergeNode/><feMergeNode in="${input}"/></feMerge>`,
    reach: Math.max(Math.abs(dx), Math.abs(dy)) + 3 * deviation,
  };
};

// What each of the ten functions draws, from its arguments and its place in
// the value (which only drop-shadow reads): { primitive, reach }, the markup
// of one or more primitives, or null where CSS would not read the arguments
// or they cannot be converted. The primitives are Filter Effects 1's (section
// 13), with stdDeviation the CSS blur radius itself.
const FUNCTIONS = new Map([
  ['blur', blur],
  ['drop-shadow', dropShadow],
  ['brightness', recolor(amount => rgbTransfer(`type="linear" slope="${amount}"`))],
  ['contrast', recolor(amount => rgbTransfer(`type="linear" slope="${amount}" intercept="${roundForMarkup(0.5 - amount / 2)}"`))],
  ['grayscale', recolor(amount => grayscaleMatrix(1 - amount), 1)],
  ['hue-rotate', hueRotate],
  ['invert', recolor(amount => rgbTransfer(`type="table" tableValues="${amount} ${roundForMarkup(1 - amount)}"`), 1)],
  ['opacity', recolor(amount => transfer(`<feFuncA type="table" tableValues="0 ${amount}"/>`), 1)],
  ['saturate', recolor(saturateMatrix)],
  ['sepia', recolor(amount => sepiaMatrix(1 - amount), 1)],
]);

// A function's name and its opening parenthesis, after any spacing.
const CALL_HEAD = /^ *([a-z][a-z-]*)\(/i;

// The index of the parenthesis closing the one opened just before `from`, or
// -1 where it is left open.
const closingParenthesis = (text, from) => {
  let depth = 1;
  for (let at = from; at < text.length; at++) {
    if (text[at] === '(') depth++;
    else if (text[at] === ')' && --depth === 0) return at;
  }
  return -1;
};

// A value's top-level function calls in order, as { name, args }, the name
// lowercased; null where anything else stands between them or a call is
// left open.
const functionCalls = (value) => {
  const calls = [];
  for (let at = 0; at < value.length;) {
    const head = CALL_HEAD.exec(value.slice(at));
    if (head === null) return null;
    const open = at + head[0].length;
    const close = closingParenthesis(value, open);
    if (close === -1) return null;
    calls.push({ name: head[1].toLowerCase(), args: value.slice(open, close) });
    at = close + 1;
  }
  return calls;
};

/**
 * Reads one CSS `filter` value (escaped text). `{ kind: 'translated',
 * primitives, reach }` where it is a list of the ten functions CSS would read,
 * in absolute lengths: `primitives` the markup of each function in written
 * order, `reach` how far the effect can draw past what it filters, in grid
 * units. `{ kind: 'kept' }` for any other value, which is carried as written.
 */
export const readFilterValue = (text) => {
  const calls = functionCalls(trimSpace(readable(String(text))));
  if (calls === null || calls.length === 0) return KEPT;
  const primitives = [];
  let reach = 0;
  for (const { name, args } of calls) {
    const effect = FUNCTIONS.get(name)?.(argumentsOf(args), primitives.length) ?? null;
    if (effect === null) return KEPT;
    primitives.push(effect.primitive);
    reach += effect.reach;
  }
  return { kind: 'translated', primitives, reach: roundForMarkup(reach) };
};

/**
 * How far one element's filters can draw past what they filter, in grid
 * units: the largest reach among its `filter` attribute and its style's
 * `filter` declarations ([name, value] pairs, escaped) that translate; 0
 * where none does, as nothing is known of a value kept as written.
 */
export const filterReach = (entries) => Math.max(0, ...entries.flatMap(([name, value]) => {
  if (name === 'filter') return [readFilterValue(value)];
  if (name !== 'style') return [];
  return declarationsOf(value).filter(({ property }) => property === 'filter').map(declaration => declaredFilter(declaration).filter);
}).map(filter => (filter.kind === 'translated' ? filter.reach : 0)));

/**
 * A <filter> holding `primitives`, in user space (the picture's own units)
 * over `region` ({ x, y, width, height }, written as given), interpolating in
 * sRGB as a CSS filter does.
 */
export const filterMarkup = (id, primitives, { x, y, width, height }) => `<filter id="${id}" filterUnits="userSpaceOnUse"`
  + ` x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB">${primitives.join('')}</filter>`;

// How far a region grows past the picture and what it covers, at most. The
// effect is drawn whole inside the picture, but past its edge, which only a
// host's `overflow: visible` shows, no further than this: a 2-unit shadow
// blurred by 2 reaches exactly 8, so an ordinary effect is drawn whole there
// too, while an absurd one (blur(200px) reaches 600) costs about the picture
// and not gigapixels.
const OVERFLOW_LIMIT = 8;

// How far past its drawn box an element may draw where the library cannot
// see it: a dot's full width, a miter join the page's CSS or a `style` key
// sets.
const REGION_MARGIN = 1;

// The smallest box ({ minX, minY, maxX, maxY }) holding both, either of which
// may be undefined (nothing there).
const joined = (a, b) => (a && b ? {
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
} : a ?? b);

/**
 * The region a filter covers, rounded to 4 decimals: the viewBox ({ x, y,
 * width, height }) and the drawn box ({ minX, minY, maxX, maxY }, undefined
 * where nothing is drawn) together, grown on every side by the effect's
 * spread, which is its `reach` plus the `outset` (how far the filters inside
 * the element already carry what it draws past the drawn box), but by no
 * more than OVERFLOW_LIMIT; and along the line (x) reaching no further than
 * the spread and REGION_MARGIN past the drawn box. The viewBox keeps the
 * effect whole wherever the picture shows, and the drawn box keeps ink
 * outside it (a crop, a host's `overflow: visible`) from being cut. The cut
 * keeps one word's region from spanning a whole sentence, which a rasterizer
 * such as resvg pays for pixel by pixel, filter by filter; the picture's
 * height is fixed by the Bliss line, so across the line it stays whole.
 */
export const filterRegion = (viewBox, drawn, reach, outset = 0) => {
  const spread = reach + outset;
  const growth = Math.min(spread, OVERFLOW_LIMIT);
  const covered = joined({ minX: viewBox.x, minY: viewBox.y, maxX: viewBox.x + viewBox.width, maxY: viewBox.y + viewBox.height }, drawn);
  const line = drawn
    ? { minX: drawn.minX - spread - REGION_MARGIN, maxX: drawn.maxX + spread + REGION_MARGIN }
    : { minX: -Infinity, maxX: Infinity };
  const minX = Math.max(covered.minX - growth, line.minX);
  const minY = covered.minY - growth;
  const maxX = Math.min(covered.maxX + growth, line.maxX);
  const maxY = covered.maxY + growth;
  return {
    x: roundForMarkup(minX),
    y: roundForMarkup(minY),
    width: roundForMarkup(maxX - minX),
    height: roundForMarkup(maxY - minY),
  };
};

// One side of the thin-element shape: 1 unit centred on the drawn extent
// where that side is thin, else the geometry's own extent.
const shapeSide = (thin, drawnMin, drawnMax, min, max) =>
  (thin ? [(drawnMin + drawnMax) / 2 - 0.5, 1] : [min, max - min]);

/**
 * An invisible rect that keeps a thin element drawn once filtered, as WebKit
 * drops a filtered element whose drawn box ({ minX, minY, maxX, maxY }, its
 * lines included) is under 1 unit wide or tall: 1 unit across, centred on the
 * drawn box, in each thin dimension, and the geometry box's own extent in the
 * other. '' where neither dimension is thin.
 */
export const thinShape = (drawn, geometry) => {
  const thinX = drawn.maxX - drawn.minX < 1;
  const thinY = drawn.maxY - drawn.minY < 1;
  if (!thinX && !thinY) return '';
  const [x, width] = shapeSide(thinX, drawn.minX, drawn.maxX, geometry.minX, geometry.maxX);
  const [y, height] = shapeSide(thinY, drawn.minY, drawn.maxY, geometry.minY, geometry.maxY);
  return `<rect x="${roundForMarkup(x)}" y="${roundForMarkup(y)}" width="${roundForMarkup(width)}"`
    + ` height="${roundForMarkup(height)}" fill="none" stroke="none"/>`;
};

/**
 * FNV-1a (32 bits) over the text's UTF-16 code units, as 8 lowercase hex
 * digits: the hash a picture's filter ids carry, so two pictures on one page
 * do not share an id.
 */
export const pictureHash = (text) => {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

// Every generated filter id is the prefix, the picture's hash and a number.
// The hash is known only once the picture is written, so a placeholder stands
// for it until then: no author's text can hold one, as each reaches the markup
// escaped and a raw `<` appears only in the library's own tags.
const ID_PREFIX = 'bliss-filter-';
const PENDING_ID = `${ID_PREFIX}<hash>-`;

/**
 * One element's attributes with each CSS filter among them that translates
 * pointed at a native <filter>: a `filter` attribute, and each `filter`
 * declaration of a `style` (rewriteStyle). `entries` are the attributes as
 * [name, value] pairs, escaped, in the order they are written; `site()`
 * returns what the element draws, `{ drawn, geometry, hit, outset }`, asked
 * only where a filter translates: `drawn` its box with its lines ({ minX,
 * minY, maxX, maxY }, undefined where it draws nothing); `geometry` the box
 * of its geometry alone, given only by an element that can hold the
 * thin-element shape (thinShape); `hit` where its link answers a click, given
 * only by a link, which the region covers as it covers `drawn`, as a browser
 * answers a click on a filtered element only inside the region; `outset` how
 * far the filters inside the element carry what it draws past `drawn`
 * (filterRegion), 0 where not given. `context` is the picture's `{ viewBox,
 * next }`, `next()` numbering the filters. With no context, as for a tree
 * rendered outside a picture, nothing is translated. Returns `{ entries,
 * defs, shape }`: the entries with each translated filter rewritten to
 * `url(#id)`, the <filter> markup for each, in order, and the thin-element
 * shape or '', judged by what the element draws, never by its link.
 */
export const translateFilters = (entries, site, context) => {
  if (!context) return { entries, defs: [], shape: '' };
  const defs = [];
  let place;
  const allocate = ({ primitives, reach }) => {
    place ??= site();
    const id = `${PENDING_ID}${context.next()}`;
    defs.push(filterMarkup(id, primitives, filterRegion(context.viewBox, joined(place.drawn, place.hit), reach, place.outset)));
    return id;
  };
  const translated = entries.map(([name, value]) => {
    if (name === 'style') return [name, rewriteStyle(value, allocate)];
    if (name !== 'filter') return [name, value];
    const filter = readFilterValue(value);
    return [name, filter.kind === 'translated' ? `url(#${allocate(filter)})` : value];
  });
  const shape = place?.drawn && place.geometry ? thinShape(place.drawn, place.geometry) : '';
  return { entries: translated, defs, shape };
};

// A generated id still pending, its number captured.
const PENDING_NUMBER = new RegExp(`${PENDING_ID}(\\d+)`, 'g');
const PENDING_FILTER = new RegExp(`<filter id="${PENDING_ID}(\\d+)"`, 'g');

/**
 * The markup with its pending filter ids numbered 1, 2, 3, … in the order
 * their <filter>s are written, and how many there are. The element tree
 * writes a group after what it holds, and knows whether a copy of an
 * element's effects holds anything only once that is written, so the numbers
 * it draws as it goes run in no useful order; numbering by position makes
 * them read down the document.
 */
export const numberFilters = (markup) => {
  if (!markup.includes(PENDING_ID)) return { markup, count: 0 };
  const order = new Map();
  for (const [, drawn] of markup.matchAll(PENDING_FILTER)) order.set(drawn, order.size + 1);
  return {
    markup: markup.replace(PENDING_NUMBER, (_, drawn) => `${PENDING_ID}${order.get(drawn)}`),
    count: order.size,
  };
};

/**
 * The markup with its filter ids completed by the picture's hash
 * (pictureHash, over `picture`, the whole picture's markup with the ids still
 * pending), so two different pictures on one page never share an id, and a
 * part of a picture carries the ids the picture carries. Markup with no
 * generated id is returned as it is, unhashed.
 */
export const fillFilterIds = (markup, picture = markup) => (markup.includes(PENDING_ID)
  ? markup.replaceAll(PENDING_ID, `${ID_PREFIX}${pictureHash(picture)}-`)
  : markup);
