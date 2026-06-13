import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the four-level hierarchical option syntax on BlissSVGBuilder: how the
 * parser places options at global (`[k=v]||`), word (`[k=v]|`), character
 * (`[k=v]Code`), and part (`[k=v]>Code`) scopes, and how those scopes layer
 * into nested `<g>` wrappers in the rendered SVG. Also pins the SVG-attribute
 * filter that keeps internal option keys (`grid`, `x`/`y`, kerning) out of the
 * rendered output and the well-formedness invariants that hold around
 * option-wrapped path data.
 *
 * Covers:
 * - Single-level option emission at each scope (global → content group;
 *   word → word `<g>`; character → character `<g>`; part → part `<g>`).
 * - Two-level cascade across each pair of scopes (global+word, global+character,
 *   global+part, word+character, word+part, character+part).
 * - Three-level cascade across each triple, and the full four-level cascade.
 * - Option syntax at parsing edges: empty character after word delimiter,
 *   character options without part options, part options without character
 *   options, multiple consecutive part options, and option-bearing parts
 *   with inline `Code:x,y` coordinates.
 * - Mixed-content sibling scenarios: parts within a character mixing
 *   option-bearing and option-less; characters within a word mixing the
 *   two; words within an expression mixing the two; combinations of
 *   inline coordinates and mixed options.
 * - SVG-attribute filter: internal option keys (`grid`, `x`, `y`,
 *   `relativeKerning`, `absoluteKerning`) never emit as SVG attributes,
 *   while pass-through keys (`fill`, `opacity`, `class`) do.
 * - Well-formedness around option-wrapped paths: no raw path data after a
 *   closing `</g>`, every path-data run is inside a `<path>` element.
 * - End-to-end scenarios combining grid, char-space, margin, stroke-width,
 *   and element-level color overrides in one expression.
 *
 * Does NOT cover:
 * - Per-option rendering contracts (the actual SVG output of stroke-width,
 *   color, dot-extra-width, fill/opacity passthrough at single scopes), see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - Bracket-option key safety against prototype-polluting keys (`__proto__`,
 *   `constructor`), see `BlissSVGBuilder.option-hardening.test.js`.
 * - Anchor-wrapping option (`href`) and its scope cascade through `<a><g>`
 *   layers, see `BlissSVGBuilder.clickable-links.test.js`.
 * - SVG metadata (svg-height/width, svg-title, svg-desc, text, background)
 *   and HTML escaping in metadata, see `BlissSVGBuilder.svg-metadata.test.js`.
 * - Object-form options (defaults/overrides via constructor arg 2), see
 *   `BlissSVGBuilder.object-options.test.js`.
 * - Per-definition `defaultOptions` and the inner-`<g>`-wins cascade, see
 *   `BlissSVGBuilder.default-options.test.js`.
 * - Bracket-option coordinate extraction (`[x=N;y=M]`), see
 *   `BlissParser.coordinate-options.test.js`.
 * - Spacing-related options (char-space, min-width, kerning, center,
 *   margin, crop, grid), see the respective per-feature test files.
 */
describe('BlissSVGBuilder hierarchical options', () => {

  describe('when an option appears only at the global scope', () => {
    it('applies global color to a single character', () => {
      const builder = new BlissSVGBuilder('[color=green]||B291');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="green"/);
    });

    it('applies global color to a multi-character expression', () => {
      const builder = new BlissSVGBuilder('[color=red]||H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
    });

    it('applies global stroke-width to a multi-character expression', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.3]||H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.3"/);
    });

    it('applies multiple global options together', () => {
      const builder = new BlissSVGBuilder('[color=blue;stroke-width=0.2]||H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="blue"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.2"/);
    });
  });

  describe('when an option appears only at the word scope', () => {
    it('applies word-level color to a single character', () => {
      const builder = new BlissSVGBuilder('[color=green]|B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('<g stroke="green">');
    });

    it('applies word color to a single word', () => {
      const builder = new BlissSVGBuilder('[color=red]|H/C8');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke="red">');
    });

    it('applies word stroke-width to a single word', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.3]|H/C8');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies different word options to different words', () => {
      const builder = new BlissSVGBuilder('[color=red]|H//[color=blue]|C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
    });

    it('applies word options to the first word only when the second has none', () => {
      const builder = new BlissSVGBuilder('[color=red]|H//C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g stroke="red">.*?<\/g>/);
      const parts = svg.split('//');
      expect(parts.length).toBeGreaterThan(0);
    });
  });

  describe('when an option appears only at the character scope', () => {
    it('applies character-level color to a single-glyph character', () => {
      const builder = new BlissSVGBuilder('[color=green]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('<g stroke="green">');
    });

    it('applies character color to a multi-part character', () => {
      const builder = new BlissSVGBuilder('[color=red]H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke="red">');
    });

    it('applies character stroke-width to a multi-part character', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.3]H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies different character options to different characters', () => {
      const builder = new BlissSVGBuilder('[color=red]H/[color=blue]C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
    });
  });

  describe('when an option appears only at the part scope', () => {
    it('applies part-level color to a single-part character', () => {
      const builder = new BlissSVGBuilder('[color=green]>B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('<g stroke="green">');
    });

    it('applies part color to the first part of a multi-part character', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke="red">');
    });

    it('applies part stroke-width to the first part of a multi-part character', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.3]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies different part options to different parts', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;[color=blue]>E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
    });

    it('renders the part option on the first part when the second has no options', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      // Exactly one stroke wrapper: the optioned first part (H) is wrapped,
      // the un-optioned second part (E) renders as a bare sibling <path>.
      expect(svg.match(/<g stroke="red">/g)).toHaveLength(1);
    });

    it('applies part-level color to a DOT part', () => {
      const builder = new BlissSVGBuilder('[color=red]>DOT');
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('applies part-level color to a COMMA part', () => {
      const builder = new BlissSVGBuilder('[color=red]>COMMA');
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('applies part-level color to a SDOT part', () => {
      const builder = new BlissSVGBuilder('[color=red]>SDOT');
      expect(builder.svgCode).toContain('stroke="red"');
    });
  });

  describe('when options cascade across two levels', () => {
    it('applies global and word options to the first word', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]|H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies global plus different word options to each of two words', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]|H//[stroke-width=0.5]|C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('applies global and character options together', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies global plus different character options to each character', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]H/[stroke-width=0.5]C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('applies global and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]>H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('<g stroke-width="0.3">');
    });

    it('applies global plus different part options to each part', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]>H;[stroke-width=0.5]>E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('prefers a part-level stroke-width over the inherited global value', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.5]||[stroke-width=1]>DOT');

      expect(builder.svgCode).toContain('stroke-width="0.6665"');
    });

    it('applies word and character options together', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3]H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
    });

    it('applies word color across all characters with character options on one', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3]H/C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
    });

    it('applies word color across all characters with different character options on each', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3]H/[stroke-width=0.5]C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('applies word and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
    });

    it('applies word color with different part options across parts', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3]>H;[stroke-width=0.5]>E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('applies character and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red][stroke-width=0.3]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
    });

    it('applies character color with different part options across parts', () => {
      const builder = new BlissSVGBuilder('[color=red][stroke-width=0.3]>H;[stroke-width=0.5]>E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('allows a character without part options followed by a part with options', () => {
      const builder = new BlissSVGBuilder('[color=red]H;[stroke-width=0.5]>E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.5"');
    });
  });

  describe('when options cascade across three or four levels', () => {
    it('applies global, word, and character options together', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]|[stroke-width=0.4]H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies global, word, and character options with the character option on one character of two', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]|[stroke-width=0.4]H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies global, word, and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3]|[stroke-width=0.4]>H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies global, character, and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.3][stroke-width=0.4]>H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies word, character, and part options together', () => {
      const builder = new BlissSVGBuilder('[color=red]|[stroke-width=0.3][stroke-width=0.4]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies options at all four levels in one expression', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.2]|[stroke-width=0.3][stroke-width=0.4]>H;E');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.2"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('applies the four-level cascade across multiple words and characters', () => {
      const builder = new BlissSVGBuilder('[color=red]||[stroke-width=0.2]|[stroke-width=0.3]H;[stroke-width=0.4]>E/C8//[stroke-width=0.5]|HL2');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('stroke-width="0.2"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('stroke-width="0.4"');
      expect(svg).toContain('stroke-width="0.5"');
    });
  });

  describe('when option syntax sits at parsing edges', () => {
    it('handles an empty word after the // delimiter following an optioned word', () => {
      const builder = new BlissSVGBuilder('[color=red]|H//C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
    });

    it('handles character options without part options on a two-character word', () => {
      const builder = new BlissSVGBuilder('[color=red]H;E/C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
    });

    it('handles part options without character options on a two-character word', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;E/C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
    });

    it('handles multiple consecutive part options across three parts', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;[color=blue]>E;[color=green]>C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke="green"');
    });

    it('handles character and part options together with inline coordinates', () => {
      const builder = new BlissSVGBuilder('[color=red][stroke-width=0.3]>H:0,8;E:2,8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
    });

    it('handles different part options with inline coordinates on each part', () => {
      const builder = new BlissSVGBuilder('[color=red]>H:0,8;[color=blue]>E:2,8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
    });
  });

  describe('when parts within a character mix option-bearing and option-less', () => {
    it('renders a part with options followed by a part without options', () => {
      const builder = new BlissSVGBuilder('[color=green]>B291;B291:2');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('<g stroke="green"><path d="M0,8h8M0,16h8M0,8v8M8,8v8"/></g>');
      expect(svg).toContain('<path d="M2,8h8M2,16h8M2,8v8M10,8v8"/>');
      expect(svg).not.toContain('M2,8h8M2,16h8M2,8v8M10,8v8</g>');
    });

    it('renders a part without options followed by a part with options', () => {
      const builder = new BlissSVGBuilder('B291;[color=red]>B291:2');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('<path d="M0,8h8M0,16h8M0,8v8M8,8v8"/>');
      expect(svg).toContain('<g stroke="red"><path d="M2,8h8M2,16h8M2,8v8M10,8v8"/></g>');
    });

    it('renders three parts with options on the first and third only', () => {
      const builder = new BlissSVGBuilder('[color=blue]>H;E;[color=red]>C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('<g stroke="blue">');
      expect(svg).toContain('<g stroke="red">');
      expect(svg).toContain('<path d="');
    });

    it('renders three parts in options/no-options/options pattern with different colors at each end', () => {
      const builder = new BlissSVGBuilder('[color=green]>B291;B291:2;[color=blue]>B291:4');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('stroke="blue"');
      const greenPath = svg.match(/<g stroke="green"><path d="[^"]+"\/><\/g>/);
      const bluePath = svg.match(/<g stroke="blue"><path d="[^"]+"\/><\/g>/);
      const middlePath = svg.match(/<path d="M2,8h8M2,16h8M2,8v8M10,8v8"\/>/);

      expect(greenPath).toBeTruthy();
      expect(bluePath).toBeTruthy();
      expect(middlePath).toBeTruthy();
    });

    it('wraps a character with character options around mixed part options and a no-option part', () => {
      const builder = new BlissSVGBuilder('[color=blue][stroke-width=0.3]>B291;B291:2');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('<g stroke="blue">');
      expect(svg).toContain('<path d="');
    });

    it('wraps a character with character options around a mixed mid-no-option part and end parts', () => {
      const builder = new BlissSVGBuilder('[color=red][stroke-width=0.2]>H;E;C8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.2"');
    });

    it('renders a part with options at a coordinate followed by parts without options', () => {
      const builder = new BlissSVGBuilder('[color=purple]>H:0,8;E:2,8;C8:4,8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="purple"');
      expect(svg).toContain('<path d="');
    });

    it('renders alternating optioned and un-optioned parts with inline coordinates', () => {
      const builder = new BlissSVGBuilder('[color=red]>H:0,8;E:2,8;[color=blue]>C8:4,8');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="blue"');
    });

    it('renders every part when mixing part options and inline coordinates across three parts', () => {
      const builder = new BlissSVGBuilder('[color=green]>B291:0,0;B291:2,0;B291:4,0');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      const pathMatches = svg.match(/<path d="[^"]+"\/>/g);
      expect(pathMatches).toBeTruthy();
      expect(pathMatches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('when characters and words within an expression mix option-bearing and option-less', () => {
    it('renders a word with multiple characters, only one of which carries options', () => {
      const builder = new BlissSVGBuilder('[color=green]B291/B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      const pathMatches = svg.match(/<path d="[^"]+"\/>/g);
      expect(pathMatches).toBeTruthy();
      expect(pathMatches.length).toBeGreaterThan(0);
    });

    it('renders a word-level option together with character options on one of two characters', () => {
      const builder = new BlissSVGBuilder('[color=blue]|[color=red]B291/B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke="red"');
    });

    it('renders a first optioned word followed by a second un-optioned word', () => {
      const builder = new BlissSVGBuilder('[color=red]|B291//B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('<g stroke="red">');
      expect(svg).toContain('<path d="');
    });

    it('renders a first un-optioned word followed by a second optioned word', () => {
      const builder = new BlissSVGBuilder('B291//[color=green]|B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('<g stroke="green">');
      expect(svg).toContain('<path d="');
    });

    it('renders global, word, and character cascade through two optioned glyphs and one un-optioned word', () => {
      const builder = new BlissSVGBuilder('[color=blue]||[color=red]|B291/B291//B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('<svg');
      expect(svg).toMatch(/<g class="bliss-content"[^>]+stroke="blue"/);
      expect(svg).toContain('<g stroke="red">');

      const pathMatches = svg.match(/<path d="[^"]+"\/>/g);
      expect(pathMatches).toBeTruthy();
      expect(pathMatches.length).toBe(2);

      expect(svg).toContain('M0,8h8M0,16h8M0,8v8M8,8v8');
      expect(svg).toContain('M10,8h8M10,16h8M10,8v8M18,8v8');
      expect(svg).toContain('M26,8h8M26,16h8M26,8v8M34,8v8');
    });
  });

  describe('when internal options are filtered out of the rendered SVG', () => {
    it('does not emit grid as an SVG attribute', () => {
      const builder = new BlissSVGBuilder('[grid=true;color=red]||B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="red"');
      expect(svg).not.toContain('grid=');
      expect(svg).not.toContain('grid="');
    });

    it('does not emit positioning options as SVG attributes on the root <svg>', () => {
      const builder = new BlissSVGBuilder('[x=5;y=10;color=blue]||B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="blue"');
      expect(svg).not.toMatch(/<svg[^>]+ x="/);
      expect(svg).not.toMatch(/<svg[^>]+ y="/);
    });

    it('does not emit kerning options as SVG attributes', () => {
      const builder = new BlissSVGBuilder('[relativeKerning=2;absoluteKerning=3;color=green]||B291');
      const svg = builder.svgCode;

      expect(svg).toContain('stroke="green"');
      expect(svg).not.toContain('relativeKerning=');
      expect(svg).not.toContain('absoluteKerning=');
    });

    it('passes valid SVG attribute keys (fill, opacity, class) through to the rendered output', () => {
      const builder = new BlissSVGBuilder('[fill=red;opacity=0.5;class=test]||B291');
      const svg = builder.svgCode;

      expect(svg).toContain('fill="red"');
      expect(svg).toContain('opacity="0.5"');
      expect(svg).toContain('class="test"');
    });
  });

  describe('when option-wrapped paths produce no orphaned path data in the output', () => {
    it('emits no raw path data directly after a closing </g> tag', () => {
      const builder = new BlissSVGBuilder('[color=green]>B291;B291:2');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/<\/g>M\d+,\d+/);
      expect(svg).not.toMatch(/\/><\/g>M\d+,\d+/);
    });

    it('wraps every path-data run inside a <path d="..."> element', () => {
      const builder = new BlissSVGBuilder('[color=red]>H;E;C8');
      const svg = builder.svgCode;

      const pathDataPattern = /M\d+/g;
      const pathData = svg.match(pathDataPattern);

      if (pathData) {
        pathData.forEach(match => {
          const surroundingContext = svg.substring(
            Math.max(0, svg.indexOf(match) - 20),
            Math.min(svg.length, svg.indexOf(match) + 50)
          );
          expect(surroundingContext).toMatch(/<path d="|d="/);
        });
      }
    });

    it('produces no orphaned path data across part, character, word, and global cascade variations', () => {
      const testCases = [
        '[color=green]>B291;B291:2',
        'B291;[color=red]>B291:2',
        '[color=blue]>H;E;[color=red]>C8',
        '[color=red]|B291//B291',
        '[color=blue]||[color=red]|B291/B291//B291'
      ];

      testCases.forEach(testCase => {
        const builder = new BlissSVGBuilder(testCase);
        const svg = builder.svgCode;

        const hasOrphanedPath = svg.match(/(<\/[^>]+>)\s*(M\d+,\d+[^<]+)(?!<)/);
        expect(hasOrphanedPath).toBeFalsy();
      });
    });
  });

  describe('when multiple option features combine end-to-end', () => {
    it('renders grid, margin, and stroke-width together', () => {
      const builder = new BlissSVGBuilder('[grid;margin=2;stroke-width=1]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('bliss-grid-line');
      expect(svg).toContain('viewBox="-2 -2 12 24"');
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="1"/);
    });

    it('falls back to the default stroke-width when the option value is non-numeric', () => {
      const builder = new BlissSVGBuilder('[stroke-width=abc]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<svg');
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.5"/);
    });

    it('falls back to a default when an option value is empty', () => {
      const builder = new BlissSVGBuilder('[margin=]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox=');
    });

    it('lets a character-level color override the global color on a second character', () => {
      const builder = new BlissSVGBuilder('[color=red]||B313/[color=blue]B291');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toContain('<g stroke="blue">');
    });

    it('combines grid, char-space, margin, stroke-width, and a character-level color override in a multi-word expression', () => {
      const builder = new BlissSVGBuilder('[grid;char-space=3;margin=1;stroke-width=0.8]||B313/[color=blue]B291//B313');
      const svg = builder.svgCode;
      const comp = builder.composition;

      expect(svg).toContain('bliss-grid-line');

      const word1 = comp.children[0];
      expect(word1.children[1].x).toBe(8 + 3);

      expect(comp.children.length).toBe(3);

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.8"/);
      expect(svg).toContain('<g stroke="blue">');

      const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
      expect(viewBoxMatch).not.toBeNull();
      const [vbX, vbY] = viewBoxMatch[1].split(' ').map(Number);
      expect(vbX).toBe(-1);
      expect(vbY).toBe(-1);
    });
  });
});
