import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { KNOWN_OPTION_KEYS } from '../src/lib/bliss-constants.js';

/**
 * Pins the curated half of the attribute naming contract: an option the library
 * owns works in either spelling, comes back in the curated one, and writing it
 * twice under two spellings reports which value was displaced.
 *
 * Before this, a bracket read only the kebab spelling. `[marginTop=3]` reached
 * the author's bag as an ordinary attribute name, shipped as `marginTop="3"`
 * and sized nothing, which is what `MISPLACED_OPTION_SPELLING` existed to say.
 * Resolving the name on ingest makes the two spellings one option, so the
 * report has nothing left to describe on that channel and the collision they
 * can now cause needs one of its own.
 *
 * Covers:
 * - Every curated option that has a camelCase spelling distinct from its kebab
 *   one, DERIVED from the vocabulary rather than listed: the two spellings
 *   render byte-identically and neither warns.
 * - The curated spelling coming back from `toString()`, whichever one was
 *   written, which is the half a render comparison cannot see.
 * - Ordering: the name is resolved before the scope gates, so a global-only
 *   option written in camelCase below global scope still reports
 *   MISPLACED_GLOBAL_OPTION rather than slipping through as a pass-through
 *   attribute.
 * - The two internal-only spellings (`autoVertical`, `cropCompact`), which are
 *   JavaScript shorthands for a whole option rather than spellings of one, and
 *   therefore keep reporting.
 * - `MULTIPLE_OPTION_SPELLINGS` on both converting channels (a bracket and the
 *   options argument), for a curated name AND for a name a standard owns, with
 *   the last written value winning and the displaced one named. The class-2
 *   pair is the row a curated-vocabulary-only implementation cannot pass.
 * - The controls that keep the report about SPELLING: one spelling written
 *   twice stays silent, and two author-owned names that merely look alike
 *   (`dataAttr` / `data-attr`) stay two separate attributes.
 * - Object spread, the idiom that decided the tie-break: an explicit camelCase
 *   override beats a kebab default spread in ahead of it.
 * - Kerning, which is curated vocabulary the parser promotes rather than
 *   dispatches on, so it reaches the contract by a different route.
 *
 * Does NOT cover:
 * - Names a standard owns, which is class 2 and landed earlier, see
 *   `BlissSVGBuilder.svg-attribute-vocabulary.test.js`. Only the collision
 *   between two of their spellings is here, because that is what this task
 *   added.
 * - Object input, the one channel that still stores what it is given verbatim;
 *   its report is pinned in `BlissSVGBuilder.option-namespace-split.test.js`.
 * - The two-bag separation itself, same file.
 * - Option VALUE validation, see `BlissSVGBuilder.option-value-gate.test.js`.
 */

const render = (input, opts) => (opts ? new BlissSVGBuilder(input, opts) : new BlissSVGBuilder(input));
const codes = (b) => b.warnings.map((w) => w.code);

// Every curated option whose camelCase spelling differs from its kebab one,
// DERIVED so an option added later is covered the day it lands. A hand-written
// list would silently stop being the whole vocabulary.
const CURATED_CAMEL_SPELLINGS = [...KNOWN_OPTION_KEYS]
  .filter((key) => key.includes('-'))
  .map((key) => key.replace(/-(.)/g, (_, letter) => letter.toUpperCase()));

describe('BlissSVGBuilder option spelling', () => {
  describe('when a curated option is written the way JavaScript spells it', () => {
    it('has a spelling to test in the derived list', () => {
      // An `it.each` over an empty array generates no rows and reports success,
      // so the derivation is asserted before anything rests on it. Membership
      // rather than a count, which would fail the day an option is added.
      expect(CURATED_CAMEL_SPELLINGS)
        .toEqual(expect.arrayContaining(['strokeWidth', 'marginTop', 'gridSkyColor', 'svgHeight']));
    });

    it('sizes the margin from a bracket, exactly as the curated spelling does', () => {
      const b = render('[marginTop=3]||B291');
      expect(b.svgCode).toBe(render('[margin-top=3]||B291').svgCode);
      expect(b.svgCode).not.toContain('marginTop');
      expect(b.warnings).toEqual([]);
    });

    it.each(CURATED_CAMEL_SPELLINGS)('renders %s identically to its curated spelling', (camel) => {
      const kebab = camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const b = render(`[${camel}=1]||B291`);
      expect(b.svgCode).toBe(render(`[${kebab}=1]||B291`).svgCode);
      expect(b.warnings).toEqual([]);
    });

    it.each(CURATED_CAMEL_SPELLINGS)('gives %s back in the curated spelling', (camel) => {
      // The render comparison above cannot see this: two builds agreeing says
      // nothing about which spelling was stored, and the serializer reads the
      // stored bag.
      const kebab = camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      expect(render(`[${camel}=1]||B291`).toString()).toBe(`[${kebab}=1]||B291`);
    });

    it('resolves the name before the scope gates', () => {
      // Resolving after them would let a global-only option written in
      // camelCase slip past the gate and ship as a pass-through attribute.
      expect(codes(render('[marginTop=3]B291'))).toContain('MISPLACED_GLOBAL_OPTION');
    });

    it('names the curated spelling when a resolved key is refused by a gate', () => {
      // The refusal names the STORED spelling, which is the rule a transient
      // refusal already follows. Resolution happens on ingest, so by the time
      // any gate sees the key the written spelling is gone; naming it back
      // would mean carrying it for one message.
      const refusal = render('[relativeKerning=3]>B291').warnings[0];
      expect(refusal.code).toBe('MISPLACED_KERNING_OPTION');
      expect(refusal.source).toBe('relative-kerning=3');
    });

    it.each([
      ['autoVertical', 'crop=auto-vertical'],
      ['cropCompact', 'crop=compact'],
    ])('still refuses %s, which spells a whole option rather than a name', (camel, remedy) => {
      // These two are not a spelling of an option, they are JavaScript
      // shorthands for a whole option and its value, so there is no name for
      // ingest to resolve and the report keeps its job.
      const b = render(`[${camel}]||B291`);
      expect(codes(b)).toContain('MISPLACED_OPTION_SPELLING');
      expect(b.warnings.find((w) => w.code === 'MISPLACED_OPTION_SPELLING').message).toContain(remedy);
    });
  });

  describe('when one option is written twice under two spellings', () => {
    it.each([
      ['[marginTop=3;margin-top=4]||B291', 4, 'marginTop=3'],
      ['[margin-top=4;marginTop=3]||B291', 3, 'margin-top=4'],
    ])('lets the last written value win, %s', (input, winner, displaced) => {
      // The winners differ between the two rows and that is the point: once
      // spelling has been declared meaningless, position is the only
      // information left. Ruled 2026-09-10; see the [done] row in backlog.md.
      const b = render(input);
      expect(b.svgCode).toBe(render(`[margin-top=${winner}]||B291`).svgCode);
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe(displaced);
    });

    it('reports two spellings even when the values agree', () => {
      // More-than-one rather than value-lost, matching MULTIPLE_ATTRIBUTE_VALUES.
      const b = render('[marginTop=3;margin-top=3]||B291');
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.svgCode).toBe(render('[margin-top=3]||B291').svgCode);
    });

    it('says nothing when one spelling is written twice', () => {
      // The control that keeps the report about SPELLING. A plain duplicate is
      // visible in the source and has always taken the last value in silence.
      const b = render('[margin-top=3;margin-top=4]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toBe(render('[margin-top=4]||B291').svgCode);
    });

    it.each([
      ['[view-box=0 0 1 1;viewBox=0 0 2 2]||B291', '0 0 2 2', 'view-box=0 0 1 1'],
      ['[viewBox=0 0 2 2;view-box=0 0 1 1]||B291', '0 0 1 1', 'viewBox=0 0 2 2'],
    ])('reports a name a standard owns as well, %s', (input, winner, displaced) => {
      // The row a collapse written against the curated vocabulary alone cannot
      // pass. Class 2 already collapsed silently; only the report was missing.
      const b = render(input);
      expect(b.svgCode).toContain(`viewBox="${winner}"`);
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe(displaced);
    });

    it('keeps two author-owned names that only look alike apart', () => {
      // Nobody owns either spelling, so they are two attributes and not one
      // name written twice.
      const b = render('[dataAttr=1;data-attr=2]||B291');
      expect(b.svgCode).toContain('dataAttr="1"');
      expect(b.svgCode).toContain('data-attr="2"');
      expect(b.warnings).toEqual([]);
    });

    it('reports each displaced value, not just the first', () => {
      const b = render('[marginTop=3;margin-top=4;marginTop=5]||B291');
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS', 'MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings.map((w) => w.source)).toEqual(['marginTop=3', 'margin-top=4']);
    });
  });

  describe('when the two spellings are written at a scope below the document', () => {
    // One row per bracket the parser reads, because each is a separate call
    // into the option pass and a report wired at one of them reads as covered.
    it.each([
      ['globally', '[strokeWidth=1;stroke-width=2]||B291', '[stroke-width=2]||B291'],
      ['on a word', '[strokeWidth=1;stroke-width=2]|B291', '[stroke-width=2]|B291'],
      ['on a character', '[strokeWidth=1;stroke-width=2]B291', '[stroke-width=2]B291'],
      ['on a part', '[strokeWidth=1;stroke-width=2]>C1', '[stroke-width=2]>C1'],
      ['on a compound part', 'B291;[strokeWidth=1;stroke-width=2]>B85', 'B291;[stroke-width=2]>B85'],
    ])('reports and collapses %s', (_where, input, collapsed) => {
      const b = render(input);
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe('strokeWidth=1');
      expect(b.toString()).toBe(collapsed);
    });

    it.each([
      // The bracket survives the overlay gate untouched and is read again for
      // real, so the gate must not report as well. Its `toString()` still shows
      // both keys, which is what makes the double report reachable: a `;;`
      // overlay stores the bracket TEXT rather than a parsed bag.
      ['when the gate keeps every key', 'B291;;[strokeWidth=1;stroke-width=2]>B81'],
      // Here the gate rewrites the bracket, so this is the last place the
      // written spellings exist and the report has to come from the gate.
      ['when the gate drops one key', 'B291;;[strokeWidth=1;stroke-width=2;margin=1]>B81'],
      ['when the gate empties the bracket', 'B291;;[marginTop=1;margin-top=2]>B81'],
    ])('reports exactly once on a word indicator, %s', (_case, input) => {
      const spellings = render(input).warnings.filter((w) => w.code === 'MULTIPLE_OPTION_SPELLINGS');
      expect(spellings).toHaveLength(1);
    });
  });

  describe('when two spellings arrive in one options object', () => {
    it.each([
      [{ marginTop: 3, 'margin-top': 4 }, 4, 'marginTop=3'],
      [{ 'margin-top': 4, marginTop: 3 }, 3, 'margin-top=4'],
    ])('collapses them, last written winning', (opts, winner, displaced) => {
      // Measured before this landed: both orders rendered correctly and neither
      // said anything, so the losing value vanished with no trace at all. Worse
      // than the bracket case, where the reader can at least see both keys.
      const b = render('B291', opts);
      expect(b.svgCode).toBe(render('B291', { 'margin-top': winner }).svgCode);
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe(displaced);
    });

    it('lets an explicit override beat a spread-in default written the other way', () => {
      // The idiom that decided the tie-break. Under a canonical-spelling-wins
      // rule the default would silently beat the override.
      const defaults = { 'margin-top': 4 };
      const b = render('B291', { ...defaults, marginTop: 3 });
      expect(b.svgCode).toBe(render('B291', { 'margin-top': 3 }).svgCode);
    });

    it('reports a name a standard owns on this channel too', () => {
      const b = render('B291', { 'view-box': '0 0 1 1', viewBox: '0 0 2 2' });
      expect(b.svgCode).toContain('viewBox="0 0 2 2"');
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.warnings[0].source).toBe('view-box=0 0 1 1');
    });

    it('says nothing for a single spelling, whichever one it is', () => {
      expect(render('B291', { marginTop: 3 }).warnings).toEqual([]);
      expect(render('B291', { 'margin-top': 3 }).warnings).toEqual([]);
    });
  });

  describe('when kerning is written the way JavaScript spells it', () => {
    it('kerns from a bracket exactly as the curated spelling does', () => {
      // Kerning is curated vocabulary the parser PROMOTES rather than
      // dispatches on, so it reaches the contract by a route the derived rows
      // above cannot exercise. Withdrawn Task 7 would have refused this input;
      // it is class 1 and compliant, and these rows say so.
      const b = render('B99/[relativeKerning=3]B291');
      expect(b.svgCode).toBe(render('B99/[relative-kerning=3]B291').svgCode);
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B99/RK:3/B291');
    });

    it('kerns from the absolute spelling too', () => {
      const b = render('B99/[absoluteKerning=4]B291');
      expect(b.svgCode).toBe(render('B99/[absolute-kerning=4]B291').svgCode);
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B99/AK:4/B291');
    });

    it('reports one displaced value when both spellings kern one character', () => {
      // Two spellings of one name collapse on ingest, so the kerning resolver
      // never sees two values and MULTIPLE_KERNING_VALUES has nothing to say.
      const b = render('B99/[relativeKerning=3;relative-kerning=4]B291');
      expect(codes(b)).toEqual(['MULTIPLE_OPTION_SPELLINGS']);
      expect(b.toString()).toBe('B99/RK:4/B291');
    });
  });
});
