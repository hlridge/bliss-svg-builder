import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the group-option placement gate: a group option `[opts]|` on an alias
 * that expands to MULTIPLE words warns MISPLACED_GROUP_OPTION, drops the
 * bracket, and renders every word — instead of silently styling only the
 * first word. Completes the bracket-placement triad (`[opts]>`↔part,
 * `[opts]`↔character, `[opts]|`↔one word group).
 *
 * Covers:
 * - `[opts]|ALIAS` where ALIAS expands across a word break (direct, chained,
 *   or composed with further characters): warn + drop + all words render.
 * - Positioning options (`[x=…]`) dropped the same way (the first word used
 *   to absorb them).
 * - The WRITTEN form `[opts]|a//b` stays valid: a top-level `//` splits groups
 *   before option parsing, so the bracket binds to group 1 by syntax.
 * - A single-word alias keeps its group option (valid placement).
 * - Interplay with the global-only KEY gate: per-key warnings fire first, the
 *   placement warning covers what remains; a bracket emptied by the key gate
 *   raises no placement warning.
 * - The malformed-`;;` fail-render path is unchanged (word breaks are
 *   collapsed there, so the placement gate never fires on it).
 * - toJSON object rebuilds do not resurrect the dropped bracket.
 *
 * Does NOT cover:
 * - The global-only option KEY gate itself, see
 *   `BlissParser.global-option-scope.test.js`.
 * - Word-indicator (`;;`) binding to multi-word aliases (Decision 6 fail-render),
 *   see `BlissParser.double-semicolon.test.js`.
 * - Group options on written single-group content (`[opts]|B291/C8`), pinned
 *   across the option suites since rc.1.
 */
describe('BlissParser group option placement', () => {
  const FIXTURES = {
    GOPP_WORD: { codeString: 'B291/C8' },     // bare alias -> ONE word, two characters
    GOPP_MULTI: { codeString: 'B291//C8' },   // bare alias -> TWO words
    GOPP_CHAIN: { codeString: 'GOPP_MULTI' }, // alias chain ending in two words
    // explicit space codes inside an alias (external review 2026-07-02 F3):
    // serialization splits them into separate groups, so a group option on the
    // alias rebinds to the first word on reparse unless gated
    GOPP_SPACE: { codeString: 'B291/TSP/C8' },   // two words around an explicit thin space
    GOPP_QSPACE: { codeString: 'B291/QSP/C8' },  // quarter-space variant
    GOPP_TRAIL: { codeString: 'B291/TSP' },      // trailing space: ONE inked word
    GOPP_LEAD: { codeString: 'TSP/B291' },       // leading space: ONE inked word
    GOPP_SPONLY: { codeString: 'TSP' },          // pure space, no inked word
    GOPP_TRAILBREAK: { codeString: 'B291//' },   // trailing word break: ONE inked word
  };
  beforeAll(() => BlissSVGBuilder.define(FIXTURES));
  afterAll(() => Object.keys(FIXTURES).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  const build = (input) => new BlissSVGBuilder(input);

  describe('when a group option is written on an alias expanding to multiple words', () => {
    it('warns MISPLACED_GROUP_OPTION, drops the bracket, and renders every word', () => {
      const gated = build('[color=red]|GOPP_MULTI');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291//C8');
      expect(gated.svgCode).toBe(build('B291//C8').svgCode);
      expect(gated.svgCode).not.toContain('stroke="red"');
    });

    it('reparses its own toString without warnings', () => {
      const roundTripped = build(build('[color=red]|GOPP_MULTI').toString());
      expect(roundTripped.warnings).toEqual([]);
    });

    it('names the alias and suggests the global form in the warning', () => {
      const [warning] = build('[color=red]|GOPP_MULTI').warnings;
      expect(warning.message).toContain('GOPP_MULTI');
      expect(warning.message).toContain('[color=red]||');
      expect(warning.source).toBe('GOPP_MULTI');
    });

    it('reports a bare boolean key in its bare form', () => {
      const gated = build('[data-flag]|GOPP_MULTI');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.warnings[0].message).toContain('[data-flag]||');
      expect(gated.toString()).toBe('B291//C8');
    });

    it('drops a positioning option the first word used to absorb', () => {
      const gated = build('[x=5]|GOPP_MULTI');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291//C8');
      expect(gated.svgCode).toBe(build('B291//C8').svgCode);
    });

    it('gates an alias chain that resolves to multiple words', () => {
      const gated = build('[color=red]|GOPP_CHAIN');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291//C8');
    });

    it('gates when the alias is composed with further characters', () => {
      const gated = build('[color=red]|GOPP_MULTI/C8');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291//C8/C8');
      expect(gated.svgCode).toBe(build('B291//C8/C8').svgCode);
    });

    it('gates an alias whose words are separated by an explicit thin space', () => {
      // regression: external review 2026-07-02 F3 — an in-alias TSP is not a
      // _wordBreak, but its serialized /TSP/ splits groups on reparse, so the
      // bracket silently rebound to the first word (svg-rt false)
      const gated = build('[color=red]|GOPP_SPACE');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291/TSP/C8');
      expect(gated.svgCode).toBe(build('GOPP_SPACE').svgCode);
      const reparsed = build(gated.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(gated.svgCode);
    });

    it('gates the quarter-space variant identically', () => {
      const gated = build('[color=red]|GOPP_QSPACE');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291/QSP/C8');
      expect(gated.svgCode).toBe(build('GOPP_QSPACE').svgCode);
    });
  });

  describe('when the alias holds only one inked word', () => {
    it('keeps the option on an alias with a trailing space', () => {
      // a trailing space splits off on reparse, but the bracket still binds
      // the only inked word — round-trip stable, so the gate must not fire
      const styled = build('[color=red]|GOPP_TRAIL');
      expect(styled.warnings).toEqual([]);
      expect(build(styled.toString()).svgCode).toBe(styled.svgCode);
    });

    it('keeps the option on an alias with a leading space', () => {
      // pins the separator-AFTER-word condition: a leading space precedes any
      // inked content, so it separates nothing
      const styled = build('[color=red]|GOPP_LEAD');
      expect(styled.warnings).toEqual([]);
      expect(styled.svgCode).toContain('stroke="red"');
      expect(build(styled.toString()).svgCode).toBe(styled.svgCode);
    });

    it('keeps the option on an alias with a trailing word break', () => {
      // same one-inked-word rule for a trailing //: a separator with no
      // content after it does not span words. The option survives the round
      // trip functionally; byte identity is NOT asserted because the BARE
      // trailing-// alias itself round-trips unstably (the expansion keeps a
      // trailing space group the written form prunes) — a pre-existing,
      // option-independent parity defect (backlog "trailing // in an alias
      // codeString keeps a trailing space group").
      const styled = build('[color=red]|GOPP_TRAILBREAK');
      expect(styled.warnings).toEqual([]);
      expect(styled.svgCode).toContain('stroke="red"');
      expect(build(styled.toString()).svgCode).toContain('stroke="red"');
    });

    it('does not fire on a pure-space alias', () => {
      // note: '[color=red]|GOPP_SPONLY' serializes to '//' today — a
      // PRE-EXISTING standalone-space collapse (the deferred QSP/TSP family,
      // extended on that backlog row); the placement gate only asserts it
      // stays out of MISPLACED_GROUP_OPTION's scope
      const spaceOnly = build('[color=red]|GOPP_SPONLY');
      expect(spaceOnly.warnings.map((w) => w.code)).not.toContain('MISPLACED_GROUP_OPTION');
    });
  });

  describe('when the multi-word content is written out with //', () => {
    it('keeps the bracket bound to the first word by syntax', () => {
      // note: the written form never reaches the gate -- a top-level // splits
      // groups BEFORE option parsing, so [opts]| binds to word 1 by syntax
      // (same alias-vs-written split as the 5a character gate).
      const written = build('[color=red]|B291//C8');
      expect(written.warnings).toEqual([]);
      expect(written.toString()).toBe('[color=red]|B291//C8');
      expect(written.svgCode).toContain('stroke="red"');
      expect(build(written.toString()).svgCode).toBe(written.svgCode);
    });
  });

  describe('when the alias expands to a single word', () => {
    it('applies the group option normally', () => {
      const valid = build('[color=red]|GOPP_WORD');
      expect(valid.warnings).toEqual([]);
      expect(valid.svgCode).toBe(build('[color=red]|B291/C8').svgCode);
    });
  });

  describe('when the bracket mixes global-only keys with stylable keys', () => {
    it('emits the key warning and the placement warning', () => {
      const gated = build('[margin=2;color=red]|GOPP_MULTI');
      expect(gated.warnings.map((w) => w.code))
        .toEqual(['MISPLACED_GLOBAL_OPTION', 'MISPLACED_GROUP_OPTION']);
      expect(gated.toString()).toBe('B291//C8');
    });

    it('stays silent on placement when the key gate empties the bracket', () => {
      const gated = build('[margin=2]|GOPP_MULTI');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B291//C8');
    });
  });

  describe('when the alias also fails the word-indicator gate', () => {
    it('keeps the fail-render path unchanged', () => {
      // The multi-word ;; fail collapses the word breaks (Decision 6), so the
      // placement gate never sees them; the group keeps its bracket and the
      // errorSource round-trips verbatim.
      const failed = build('[color=red]|GOPP_MULTI;;B81');
      expect(failed.warnings.map((w) => w.code)).toEqual(['MALFORMED_WORD_INDICATOR']);
      expect(failed.toString()).toBe('[color=red]|GOPP_MULTI;;B81');
    });
  });

  describe('when the parse result is rebuilt from toJSON', () => {
    it('does not resurrect the dropped bracket', () => {
      const gated = build('[color=red]|GOPP_MULTI');
      const rebuilt = new BlissSVGBuilder(gated.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.toString()).toBe('B291//C8');
      expect(rebuilt.svgCode).toBe(gated.svgCode);
    });
  });
});
