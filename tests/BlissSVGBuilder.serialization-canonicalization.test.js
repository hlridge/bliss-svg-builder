import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the two canonicalization rules toString() applies: a space run is
 * spelled one space at a time, and a run of single outlined external letters
 * is re-collapsed into the compact `Xword` shorthand it was written as.
 *
 * The shared principle: within a uniform run the serializer emits the same
 * compact shorthand the parser accepts, and a run stays explicit only where an
 * element diverges (a non-default space; a per-element option, coordinate,
 * head marker or composition boundary). Neither rule changes what renders.
 *
 * Covers:
 * - A space run that mixes default and non-default spaces, spelled per space.
 * - Uniform space runs (all default, all non-default) emitting what they
 *   already did.
 * - The punctuation boundary, where QSP is the default and TSP is the
 *   divergence, so the two spellings swap roles.
 * - A run of single external letters collapsing back to `Xword`, including
 *   behind a kerning marker and under a word-level `;;` overlay.
 * - Every element that keeps a run explicit: a coordinate, an option bracket at
 *   glyph or part scope, a head marker, a kerning marker mid-run, a word break,
 *   a non-letter neighbour, and a multi-letter text-fallback glyph.
 * - Byte-identical SVG after a toString() round trip for every row above.
 *
 * Does NOT cover:
 * - How a space run is GROUPED into composition.children, see
 *   `BlissSVGBuilder.space-grouping.test.js`.
 * - Which space code an implicit `/` resolves to, see
 *   `BlissParser.space-resolution.test.js`.
 * - Space-glyph advance widths, see `BlissSVGBuilder.space-glyphs.test.js`.
 * - X-run EXPANSION at parse time (the inverse of the collapse here), see
 *   `BlissParser.x-codes.test.js`.
 * - Object-authored adjacent space groups, see
 *   `BlissSVGBuilder.empty-content-serialization.test.js`.
 * - What the internal text-fallback routing key means, which the same issue
 *   settled by reading `XTXT_<letters>` as the letters it names when every one
 *   of them has an outline, see `BlissSVGBuilder.text-fallback.test.js`.
 *
 * @issue: #19
 */

const serialized = (input) => new BlissSVGBuilder(input).toString();

// A canonicalization may only change the SPELLING, never the picture. Reported
// as two named fields rather than one boolean so a failure names which half
// broke, instead of "expected true to be false".
const roundTrip = (input) => {
  const builder = new BlissSVGBuilder(input);
  const reparsed = new BlissSVGBuilder(builder.toString());
  return {
    samePicture: reparsed.svgCode === builder.svgCode,
    settled: reparsed.toString() === builder.toString(),
  };
};
const INTACT = { samePicture: true, settled: true };

describe('BlissSVGBuilder serialization canonicalization', () => {

  describe('when a space run mixes default and non-default spaces', () => {
    it('spells the default spaces as slashes and only the divergent one explicitly', () => {
      expect(serialized('H//QSP/H')).toBe('H//QSP/H');
      expect(serialized('H///QSP/H')).toBe('H///QSP/H');
      expect(serialized('H/QSP//H')).toBe('H/QSP//H');
    });

    it('spells a divergent space in the middle of a run without expanding its neighbours', () => {
      expect(serialized('H/TSP/QSP/TSP/H')).toBe('H//QSP//H');
    });

    it('renders the same picture and settles after one cycle', () => {
      expect(roundTrip('H//QSP/H')).toEqual(INTACT);
      expect(roundTrip('H/TSP/QSP/TSP/H')).toEqual(INTACT);
      expect(roundTrip('H/QSP//H')).toEqual(INTACT);
    });
  });

  describe('when a space run is uniform', () => {
    it('collapses an all-default run to slashes', () => {
      expect(serialized('H/TSP/H')).toBe('H//H');
      expect(serialized('H/TSP/TSP/H')).toBe('H///H');
      expect(serialized('H////H')).toBe('H////H');
    });

    it('writes an all-divergent run out in full', () => {
      expect(serialized('H/QSP/H')).toBe('H/QSP/H');
      expect(serialized('H/QSP/QSP/H')).toBe('H/QSP/QSP/H');
    });

    it('keeps the separator that spells a space at the edges of the string', () => {
      // pins both halves of the edge trim: a slash next to ANOTHER slash is the
      // space itself and stays, while the one next to an explicit code has
      // nothing left to separate and goes. Dropping either half loses a space.
      expect(serialized('//H')).toBe('//H');
      expect(serialized('H//')).toBe('H//');
      expect(serialized('//QSP/H')).toBe('//QSP/H');
      expect(serialized('H/QSP//')).toBe('H/QSP//');
    });

    it('drops the separator that would have nothing to separate at an edge', () => {
      expect(serialized('/QSP/H')).toBe('QSP/H');
      expect(serialized('/QSP//H')).toBe('QSP//H');
      expect(serialized('H//QSP')).toBe('H//QSP');
      expect(roundTrip('//H')).toEqual(INTACT);
      expect(roundTrip('H//')).toEqual(INTACT);
      expect(roundTrip('/QSP//H')).toEqual(INTACT);
    });

    it('keeps a run that a ZSA splits uniform on both sides', () => {
      // ZSA is content, not a space, so it ends one run and starts another.
      expect(serialized('H/TSP/ZSA/TSP/H')).toBe('H//ZSA//H');
      expect(serialized('H/TSP/ZSA/QSP/H')).toBe('H//ZSA/QSP/H');
    });
  });

  describe('when the space run precedes punctuation', () => {
    it('treats QSP as the default and TSP as the divergence', () => {
      // B4 shrinks the preceding word space, which makes QSP the default there.
      expect(serialized('H/QSP/B4')).toBe('H//B4');
      expect(serialized('H/TSP/B4')).toBe('H/TSP/B4');
    });

    it('spells a mixed run against the punctuation default', () => {
      expect(serialized('H/QSP/TSP/B4')).toBe('H//TSP/B4');
      expect(serialized('H/TSP/QSP/B4')).toBe('H/TSP//B4');
    });

    it('collapses an all-QSP run before punctuation', () => {
      expect(serialized('H/QSP/QSP/B4')).toBe('H///B4');
      expect(roundTrip('H/QSP/TSP/B4')).toEqual(INTACT);
      expect(roundTrip('H/TSP/QSP/B4')).toEqual(INTACT);
    });
  });

  describe('when consecutive glyphs are single outlined external letters', () => {
    it('re-collapses the run into the compact word it was written as', () => {
      expect(serialized('XBlissary')).toBe('XBlissary');
      expect(serialized('Xhello')).toBe('Xhello');
      expect(serialized('Xab')).toBe('Xab');
    });

    it('collapses a run written out letter by letter', () => {
      expect(serialized('Xa/Xb')).toBe('Xab');
      expect(serialized('Xa/Xb/Xc')).toBe('Xabc');
    });

    it('leaves a single letter alone', () => {
      expect(serialized('XB')).toBe('XB');
      expect(serialized('XB/B291')).toBe('XB/B291');
    });

    it('collapses behind a kerning marker, which is its own segment', () => {
      expect(serialized('RK:3/Xab')).toBe('RK:3/Xab');
      expect(serialized('AK:2/Xab')).toBe('AK:2/Xab');
    });

    it('collapses under a word-level indicator overlay', () => {
      expect(serialized('Xab;;B81')).toBe('Xab;;B81');
    });

    it('renders the same picture and settles after one cycle', () => {
      expect(roundTrip('XBlissary')).toEqual(INTACT);
      expect(roundTrip('Xa/Xb/Xc')).toEqual(INTACT);
      expect(roundTrip('RK:3/Xab')).toEqual(INTACT);
      expect(roundTrip('Xab;;B81')).toEqual(INTACT);
    });
  });

  describe('when a member of an external-letter run carries its own decoration', () => {
    it('keeps a run explicit around a coordinate', () => {
      expect(serialized('Xa:1,2/Xb')).toBe('Xa:1,2/Xb');
      expect(serialized('Xa/Xb:1,2')).toBe('Xa/Xb:1,2');
    });

    it('keeps a run explicit around an option bracket at either scope', () => {
      // A glyph-scope bracket rides the FIRST expanded letter, so the written
      // `[color=red]Xab` is not the same statement as an undecorated run.
      expect(serialized('[color=red]Xab')).toBe('[color=red]Xa/Xb');
      expect(serialized('Xa/[color=red]>Xb')).toBe('Xa/[color=red]>Xb');
    });

    it('keeps a run explicit around a head marker', () => {
      expect(serialized('Xa^/Xb')).toBe('Xa^/Xb');
      expect(serialized('Xa/Xb^')).toBe('Xa/Xb^');
    });

    it('collapses the letters either side of a marked one, but not through it', () => {
      // pins that the collapse reads the segments AFTER the marker is stamped
      // on: run it earlier and the marked letter would be folded into the word,
      // which has nowhere to carry a `^`
      expect(serialized('Xa^/Xb/Xc')).toBe('Xa^/Xbc');
      expect(serialized('Xa/Xb/Xc^')).toBe('Xab/Xc^');
      expect(serialized('Xa/Xb^/Xc')).toBe('Xa/Xb^/Xc');
      expect(roundTrip('Xa^/Xb/Xc')).toEqual(INTACT);
    });

    it('keeps a run explicit around a kerning marker written inside it', () => {
      expect(serialized('Xa/RK:3/Xb')).toBe('Xa/RK:3/Xb');
    });
  });

  describe('when an external-letter run meets a boundary', () => {
    it('stops at a word break', () => {
      expect(serialized('Xa//Xb')).toBe('Xa//Xb');
      expect(serialized('Xab//Xcd')).toBe('Xab//Xcd');
    });

    it('stops at a glyph that is not an external letter', () => {
      expect(serialized('Xa/B291/Xb')).toBe('Xa/B291/Xb');
    });

    it('never absorbs a multi-letter text fallback into a run', () => {
      // `Xaλ` is ONE glyph already (λ has no outline, so the whole run falls
      // back to text). Folding a neighbouring letter into it would change a
      // two-glyph word into a one-glyph word on reparse.
      expect(serialized('Xc/Xaλ')).toBe('Xc/Xaλ');
      expect(serialized('Xaλ/Xc')).toBe('Xaλ/Xc');
      expect(serialized('XM/Xhαllo')).toBe('XM/Xhαllo');
      expect(roundTrip('Xc/Xaλ')).toEqual(INTACT);
      expect(roundTrip('Xaλ/Xc')).toEqual(INTACT);
    });

    it('never absorbs a single-character text fallback into a run', () => {
      // `XTXT_λ` surfaces as `Xλ`, which is spelled like an outlined letter but
      // is not one. What is pinned here is only that the collapse leaves it out
      // of the run, which is separate from the reparse merge pinned below.
      expect(serialized('Xa/XTXT_λ')).toBe('Xa/Xλ');
      expect(serialized('XTXT_λ/Xa')).toBe('Xλ/Xa');
    });

    // RULED, and this row exists so the ruling is not re-found as a bug: a text
    // fallback is what the library reaches for when an outlined letter does not
    // exist, and a fallback's appearance is decided by the reader's installed
    // font, so it can never promise a particular picture. A round trip that
    // redraws the pair in one font is therefore an improvement rather than a
    // loss, and the merge below is INTENDED.
    //
    // The cost, measured and stated here because the assertions cannot show it:
    // `Xa` renders as an outlined <path> before the trip and as font text after,
    // so the pair stops being half drawn artwork and half font and becomes
    // consistently font-rendered. Reachable without writing the internal key,
    // via `define({MYFB:{codeString:'Xλ'}})` then `Xa/MYFB`.
    it('merges an outlined letter into a one-character text fallback, by design', () => {
      expect(serialized('Xa/XTXT_λ')).toBe('Xa/Xλ');
      expect(roundTrip('Xa/XTXT_λ')).toEqual({ samePicture: false, settled: false });

      // One redraw, not a cascade: the merged form is its own fixed point.
      expect(serialized('Xa/Xλ')).toBe('Xaλ');
      expect(roundTrip('Xa/Xλ')).toEqual(INTACT);
    });

    it('leaves a word that is already one text-fallback glyph alone', () => {
      expect(serialized('Xhαllo')).toBe('Xhαllo');
      expect(serialized('Xλόγος')).toBe('Xλόγος');
      expect(roundTrip('Xhαllo')).toEqual(INTACT);
    });
  });
});
