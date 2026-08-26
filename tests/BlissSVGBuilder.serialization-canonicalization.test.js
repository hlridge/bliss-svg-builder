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
 * - The text-fallback round-trip gap (`XTXT_hello` serializes to `Xhello`,
 *   which reparses as outlined letters), registered on the #19 backlog row.
 *
 * @issue: #19
 */

const serialized = (input) => new BlissSVGBuilder(input).toString();

// A canonicalization may only change the SPELLING, never the picture.
const survivesRoundTrip = (input) => {
  const builder = new BlissSVGBuilder(input);
  const reparsed = new BlissSVGBuilder(builder.toString());
  return reparsed.svgCode === builder.svgCode && reparsed.toString() === builder.toString();
};

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
      expect(survivesRoundTrip('H//QSP/H')).toBe(true);
      expect(survivesRoundTrip('H/TSP/QSP/TSP/H')).toBe(true);
      expect(survivesRoundTrip('H/QSP//H')).toBe(true);
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
      expect(survivesRoundTrip('//H')).toBe(true);
      expect(survivesRoundTrip('H//')).toBe(true);
      expect(survivesRoundTrip('/QSP//H')).toBe(true);
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
      expect(survivesRoundTrip('H/QSP/TSP/B4')).toBe(true);
      expect(survivesRoundTrip('H/TSP/QSP/B4')).toBe(true);
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
      expect(survivesRoundTrip('XBlissary')).toBe(true);
      expect(survivesRoundTrip('Xa/Xb/Xc')).toBe(true);
      expect(survivesRoundTrip('RK:3/Xab')).toBe(true);
      expect(survivesRoundTrip('Xab;;B81')).toBe(true);
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
      expect(survivesRoundTrip('Xa^/Xb/Xc')).toBe(true);
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
      expect(survivesRoundTrip('Xc/Xaλ')).toBe(true);
      expect(survivesRoundTrip('Xaλ/Xc')).toBe(true);
    });

    it('never absorbs a single-character text fallback into a run', () => {
      // `XTXT_λ` surfaces as `Xλ`, which is spelled like an outlined letter but
      // is not one. What is pinned here is only that the collapse leaves it out
      // of the run, which is why this chunk neither caused nor worsened the
      // round-trip gap the two todos below own.
      expect(serialized('Xa/XTXT_λ')).toBe('Xa/Xλ');
      expect(serialized('XTXT_λ/Xa')).toBe('Xλ/Xa');
    });

    // Registered in `backlog.md` as a sibling of #19, routed to the external-
    // character direction (GH #26): an outlined letter beside a single-character
    // text fallback serializes to a string that reparses as ONE merged text
    // glyph, silently redrawing a two-glyph word. Reachable without writing the
    // internal key, via `define({MYFB:{codeString:'Xλ'}})` then `Xa/MYFB`.
    it.todo('keeps an outlined letter beside a one-character text fallback across a round trip');
    it.todo('reports the merge when a round trip cannot keep the two glyphs apart');

    it('leaves a word that is already one text-fallback glyph alone', () => {
      expect(serialized('Xhαllo')).toBe('Xhαllo');
      expect(serialized('Xλόγος')).toBe('Xλόγος');
      expect(survivesRoundTrip('Xhαllo')).toBe(true);
    });
  });
});
