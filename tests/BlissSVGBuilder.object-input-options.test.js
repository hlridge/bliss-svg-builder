import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { KNOWN_OPTION_KEYS } from '../src/lib/bliss-constants.js';

/**
 * Pins what an options bag does when it arrives inside a composition OBJECT: the
 * same thing it does in a bracket. The name is resolved on ingest, two spellings
 * of one name collapse with the last written winning, and the value is stored in
 * the one shape the rest of the library reads.
 *
 * This was the last channel that stored a bag exactly as it was given. While it
 * did, a curated option written the way JavaScript spells it reached the pass as
 * an ordinary attribute name, shipped as `marginTop="3"` and sized nothing, and
 * `MISPLACED_OPTION_SPELLING` existed to say so. Resolving the name here retires
 * that report: there is no channel left that can deliver such a key.
 *
 * Covers:
 * - Every curated option with a camelCase spelling of its own, DERIVED from the
 *   vocabulary rather than listed: it computes, byte-identically to its curated
 *   spelling, and says nothing.
 * - One row per scope an options bag can sit at (document, word, character,
 *   part, and a hand-authored transient bag), because the walk that reaches them
 *   has a call site per level and a document-level row passes with the rest
 *   still verbatim. Each row proves the option MOVED something first, so it
 *   cannot pass on two identical unstyled pictures.
 * - A name a standard owns (`view-box`) and a name nobody owns (`myOwnAttr`),
 *   which are the other two classes of the naming contract on this channel.
 * - `MULTIPLE_OPTION_SPELLINGS` here too, last written winning, with one watcher
 *   per bag: two bags each holding one spelling are a layering, not a collision.
 * - The value shapes this channel converges on: a boolean stays a boolean, so
 *   `{grid: true}` still paints; everything else primitive is stored as text;
 *   and an object, an array or a null is dropped rather than stringified into
 *   the markup.
 * - The two names the parser PROMOTES into an options bag rather than the author
 *   writing them (`relativeKerning`, `absoluteKerning`), which are the library's
 *   own fields riding in the bag and must survive a round trip untouched.
 * - The round-trip tripwire, one input per naming class: rebuilding a
 *   composition from its own `toJSON()` renders byte-identically.
 *
 * Does NOT cover:
 * - The same contract in a bracket, in the options argument and through a
 *   mutation call, see `BlissSVGBuilder.option-spelling.test.js`.
 * - The two-bag namespace separation that made the retired report possible, see
 *   `BlissSVGBuilder.option-namespace-split.test.js`.
 * - Which spelling `toJSON()` gives back, which is a separate question from what
 *   it accepts, see `BlissSVGBuilder.json-output.test.js`.
 * - Option VALUE validation (ranges, clamps), see
 *   `BlissSVGBuilder.option-value-gate.test.js` for the numeric half and
 *   `BlissSVGBuilder.text-option-values.test.js` for the string half. The rows
 *   here pin only that this channel DELIVERS such a value to the gate, since it
 *   is the one channel that can.
 */

const build = (input) => new BlissSVGBuilder(input);
const codes = (b) => b.warnings.map((w) => w.code);
const viewBox = (b) => b.svgCode.match(/viewBox="[^"]*"/)[0];

// A composition object shaped the way `toJSON()` emits one, with the bag under
// test placed at a different scope in each. The bag is the only thing that
// varies between the rows that use them.
const atDocument = (options) => ({ options, groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }] });
const atWord = (options) => ({ groups: [{ options, glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }] });
const atCharacter = (options) => ({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }], options }] }] });
const atPart = (options) => ({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291', options }] }] }] });
const asTransient = (transientOptions) => ({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }], transientOptions }] }] });

// `stroke-width` is the carrier for the scope rows because it is the one curated
// option that is live at every one of them; the global-only vocabulary (margins,
// crop, grid) is inert below the document and would make four of five rows
// unable to fail.
const SCOPES = [
  ['the document', atDocument],
  ['a word', atWord],
  ['a character', atCharacter],
  ['a part', atPart],
  ['a hand-authored transient bag', asTransient],
];

// Every curated option whose camelCase spelling differs from its kebab one,
// DERIVED so an option added later is covered the day it lands.
const CURATED_CAMEL_SPELLINGS = [...KNOWN_OPTION_KEYS]
  .filter((key) => key.includes('-'))
  .map((key) => key.replace(/-(.)/g, (_, letter) => letter.toUpperCase()));

describe('BlissSVGBuilder object-input options', () => {
  describe('when a curated option is written the way JavaScript spells it', () => {
    it('has a spelling to test in the derived list', () => {
      // An `it.each` over an empty array generates no rows and reports success,
      // so the derivation is asserted before anything rests on it.
      expect(CURATED_CAMEL_SPELLINGS)
        .toEqual(expect.arrayContaining(['strokeWidth', 'marginTop', 'gridSkyColor']));
    });

    it('sizes the margin, exactly as the curated spelling does', () => {
      const camel = build(atDocument({ marginTop: '3' }));
      expect(camel.svgCode).toBe(build(atDocument({ 'margin-top': '3' })).svgCode);
      expect(camel.svgCode).not.toContain('marginTop');
      expect(camel.warnings).toEqual([]);
    });

    it.each(CURATED_CAMEL_SPELLINGS)('renders %s identically to its curated spelling', (camel) => {
      const kebab = camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const b = build(atDocument({ [camel]: 1 }));
      expect(b.svgCode).toBe(build(atDocument({ [kebab]: 1 })).svgCode);
      expect(b.warnings).toEqual([]);
    });

    it.each(SCOPES)('resolves the name at %s', (_where, at) => {
      const camel = build(at({ strokeWidth: 2 }));
      // The option really did move something, so the row cannot pass on two
      // identical unstyled pictures.
      expect(camel.svgCode).not.toBe(build(at({})).svgCode);
      expect(camel.svgCode).toBe(build(at({ 'stroke-width': 2 })).svgCode);
      expect(camel.svgCode).not.toContain('strokeWidth');
      expect(camel.warnings).toEqual([]);
    });

    it('gives the curated spelling back from toString()', () => {
      // A render comparison cannot see this: two builds agreeing says nothing
      // about which spelling was stored, and the serializer reads the bag.
      expect(build(atDocument({ marginTop: '3' })).toString()).toBe('[margin-top=3]||B291');
    });

    it('no longer reports a spelling that now computes', () => {
      // The report retires with this channel. Every other one resolved the name
      // already, so nothing is left that can deliver a curated camelCase key to
      // the options pass.
      expect(codes(build(atDocument({ marginTop: '3' })))).toEqual([]);
      expect(codes(build(atCharacter({ strokeWidth: 2 })))).toEqual([]);
    });

    it('still reports a spelling that names a whole option rather than a name', () => {
      // `autoVertical` is a JavaScript shorthand for `crop=auto-vertical`, not a
      // spelling of a name, so ingest has nothing to resolve and the report
      // keeps its job. Expanding it here instead would read `crop` at a scope
      // where `crop` is inert, turning a report into silence.
      const b = build(atDocument({ autoVertical: true }));
      expect(codes(b)).toEqual(['MISPLACED_OPTION_SPELLING']);
      expect(viewBox(b)).toBe(viewBox(build(atDocument({}))));
    });
  });

  describe('when the name belongs to a standard or to nobody', () => {
    it('resolves a name a standard owns, whichever way it is written', () => {
      const written = build(atDocument({ 'view-box': '0 0 50 50' }));
      expect(written.svgCode).toContain('viewBox="0 0 50 50"');
      expect(written.svgCode).toBe(build(atDocument({ viewBox: '0 0 50 50' })).svgCode);
      expect(written.warnings).toEqual([]);
    });

    it.each(['data-attr', 'dataAttr', 'myOwnAttr'])('emits %s exactly as written', (name) => {
      const b = build(atDocument({ [name]: '3' }));
      expect(b.svgCode).toContain(`${name}="3"`);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when one name is written twice under two spellings', () => {
    it.each([
      [{ marginTop: 3, 'margin-top': 4 }, 4, 'marginTop=3'],
      [{ 'margin-top': 4, marginTop: 3 }, 3, 'margin-top=4'],
    ])('collapses them, last written winning', (options, winner, displaced) => {
      // Measured before this landed: both keys survived, only the kebab one was
      // read, and both orders therefore rendered the same. Resolution is what
      // makes the collision invisible, so it is what has to report it.
      const b = build(atDocument(options));
      expect(b.svgCode).toBe(build(atDocument({ 'margin-top': winner })).svgCode);
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe(displaced);
    });

    it('reports a name a standard owns as well', () => {
      // The row a collapse written against the curated vocabulary alone cannot
      // pass.
      const b = build(atDocument({ 'view-box': '0 0 1 1', viewBox: '0 0 2 2' }));
      expect(b.svgCode).toContain('viewBox="0 0 2 2"');
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe('view-box=0 0 1 1');
    });

    it('watches each bag separately, so two scopes are a layering', () => {
      // One spelling per bag is not a collision, however the two bags are
      // spelled. Without a watcher per bag this reports a displacement between
      // two values that never met.
      const b = build({
        options: { strokeWidth: 1 },
        groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }], options: { 'stroke-width': 2 } }] }],
      });
      expect(b.warnings).toEqual([]);
    });

    it("treats one node's two bags as two bags as well", () => {
      // The row above splits the two spellings across two LEVELS, which a
      // watcher pooled per NODE would still keep apart. This one puts them in
      // the two bags of a single node, which is the case that tells a per-bag
      // watcher from a per-node one. The transient bag wins the paint, as an
      // overlay must.
      const b = build({
        groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }],
                              options: { strokeWidth: 1 },
                              transientOptions: { 'stroke-width': 2 } }] }],
      });
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toBe(build({
        groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }],
                              transientOptions: { 'stroke-width': 2 } }] }],
      }).svgCode);
    });

    it('reports once per bag that holds both spellings', () => {
      // The inner pair is one a character can hold. It used to be `marginTop`,
      // which is refused at character scope before any spelling is noted.
      const b = build({
        options: { strokeWidth: 1, 'stroke-width': 2 },
        groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }], options: { strokeWidth: 1, 'stroke-width': 2 } }] }],
      });
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS', 'MULTIPLE_OPTION_SPELLINGS']);
    });

    it('keeps two author-owned names that only look alike apart', () => {
      const b = build(atDocument({ dataAttr: '1', 'data-attr': '2' }));
      expect(b.svgCode).toContain('dataAttr="1"');
      expect(b.svgCode).toContain('data-attr="2"');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the value is not a string', () => {
    it('keeps a boolean a boolean, so the switch still fires', () => {
      // Only a real `true` enables a boolean option, so a resolution pass that
      // stringified on the way past would leave `{grid: true}` holding the text
      // "true", paint nothing, and leave the picture looking untouched.
      expect(build(atDocument({ grid: true })).svgCode).toContain('class="bliss-grid');
      expect(build(atDocument({ grid: 'true' })).svgCode).not.toContain('class="bliss-grid');
    });

    it('resolves the name of a numeric value without reshaping the value', () => {
      // SETTLED 2026-09-11 at the typed surface: the TYPE widened, the value
      // did not move. This channel stores what the author wrote, so it
      // publishes the authored type; the options argument arrives as text and
      // publishes a string. `BlissJSON` is both the constructor's input type
      // and `toJSON()`'s return type, and a hand-authored `{ marginTop: 1 }`
      // renders correctly, so a declaration without `number` forbade an input
      // the library accepts. Stringifying instead would have moved shipped
      // output to satisfy a type that was wrong on the input side anyway.
      // `BlissSVGBuilder.typed-option-surface.test.js` now derives the declared
      // union from what the library publishes, so this row and that one move
      // together.
      const camel = build(atDocument({ marginTop: 3 }));
      expect(camel.svgCode).toBe(build(atDocument({ 'margin-top': 3 })).svgCode);
      expect(Object.values(camel.toJSON().options)).toEqual([3]);
    });

    it.each([
      ['a null', null, 'char-space=null'],
      ['an empty list', [], 'char-space='],
      ['a list holding a number', [5], 'char-space=5'],
    ])('hands %s to the value gate rather than dropping it first', (_kind, value, source) => {
      // This channel resolves NAMES and leaves values alone, which is what lets
      // the gate refuse a value by name here. `#toRaw` drops all three before
      // any gate exists, so converging on it would trade each of these refusals
      // for silence. Pinned as the reason the resolution pass stops at names.
      //
      // The refusal names the RESOLVED spelling, which is also what says the
      // pass ran: the author wrote `charSpace`.
      const b = build(atDocument({ charSpace: value }));
      expect(b.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.warnings[0].source).toBe(source);
    });
  });

  describe('when the bag holds a name the parser promoted rather than the author writing it', () => {
    it.each([
      ['B99/RK:3/B291', 'relativeKerning'],
      ['B99/AK:4/B291', 'absoluteKerning'],
    ])('round-trips %s whole', (input, promoted) => {
      // `toJSON()` stores kerning under the name the PARSER wrote there rather
      // than a spelling the author chose, so this is the one channel where
      // resolving a curated name could rewrite one of the library's own fields.
      // It is resolved anyway, because the contract counts the two kerning names
      // as curated vocabulary and a channel that exempted them would be the only
      // one that does. These rows are what says the resolution costs nothing:
      // the kerning resolver reads either spelling and the name is promoted back
      // on the way out, so both the render and the serialized tree come back
      // whole.
      const b = build(input);
      const json = b.toJSON();
      expect(Object.keys(json.groups[0].glyphs[1].options)).toEqual([promoted]);
      const rebuilt = build(json);
      expect(rebuilt.svgCode).toBe(b.svgCode);
      expect(rebuilt.toJSON()).toEqual(json);
      expect(rebuilt.warnings).toEqual([]);
    });
  });

  describe('when a value the option cannot use reaches a name the gate reads', () => {
    // These four used to be stringified into the shipped document instead:
    // `stroke="[object Object]"`, `stroke="null"`, and a wrong accessible name
    // wherever `aria-label` carried one. Measured across 14 names, 32 of 56
    // combinations leaked, and the numeric half of the gate was the only thing
    // refusing any of them.
    //
    // The string half now covers the rest, and it lives where the option is
    // DISPATCHED rather than at ingest: resolving names cannot know that `true`
    // is right for `grid` and wrong for `color`, and ingest sits upstream of the
    // numeric half, so refusing there would replace twelve well-worded refusals
    // with one generic one.
    //
    // The gate itself is pinned in `BlissSVGBuilder.text-option-values.test.js`,
    // which sweeps the curated vocabulary. These rows stay here because object
    // input is the one channel that can DELIVER such a value: the DSL produces
    // strings, and `#toRaw` drops all four in front of the other entry points.
    it.each([
      ['an object', { a: 1 }, '[object Object]'],
      ['an array', [1, 2], '1,2'],
      ['a null', null, 'null'],
      ['undefined', undefined, 'undefined'],
    ])('refuses %s rather than stringifying it into the markup', (_kind, value, coerced) => {
      const b = build(atDocument({ color: value }));
      expect(b.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toContain(`stroke="${coerced}"`);
      expect(b.svgCode).toBe(build(atDocument({})).svgCode);
    });

    it('refuses the same value where the numeric gate can see it', () => {
      // The control that says the two halves agree rather than one having
      // displaced the other: the numeric half still owns its own names.
      const b = build(atDocument({ 'stroke-width': { a: 1 } }));
      expect(b.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toContain('[object Object]');
    });
  });

  describe('when the library itself hands an object to the constructor', () => {
    // `splitAt` builds the right half by passing a raw tree back through the
    // constructor, so a DSL composition reaches the object-input branch without
    // anyone writing an object. The bags it carries have already been resolved
    // once, which makes this the row that fails if resolution is not idempotent
    // or if the collapse watcher reports against a bag it has already seen.
    it('resolves an already-resolved tree to the same thing, silently', () => {
      const b = new BlissSVGBuilder('[marginTop=3;myOwnAttr=x]||B291//B99/RK:3/B291');
      const right = b.splitAt(1);
      expect(right.warnings).toEqual([]);
      expect(right.toString()).toBe('[margin-top=3;myOwnAttr=x]||B99/RK:3/B291');
      expect(right.svgCode).toBe(new BlissSVGBuilder('[margin-top=3;myOwnAttr=x]||B99/RK:3/B291').svgCode);
    });
  });

  describe('when a composition is rebuilt from its own toJSON()', () => {
    it.each([
      ['a curated name', '[margin-top=3]||B291'],
      ['a name a standard owns', '[stroke-dasharray=2 2]||B291'],
      ['a name nobody owns', '[myOwnAttr=3]||B291'],
      ['the JavaScript spelling of a curated name', '[marginTop=3]||B291'],
      ['a name a standard owns, written the JavaScript way', '[viewBox=0 0 9 9]||B291'],
    ])('renders byte-identically: %s', (_class, input) => {
      // The tripwire that fails the day what `toJSON()` emits and what the
      // constructor accepts stop agreeing.
      const b = build(input);
      expect(build(b.toJSON()).svgCode).toBe(b.svgCode);
    });
  });
});
