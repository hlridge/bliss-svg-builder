import { describe, it, expect } from 'vitest';
import {
  absoluteNeverHead,
  blissHeadGlyphExclusions,
  conditionalExceptions,
  deliberatelyNotExcluded,
  lowPriorityExclusions,
} from '../src/lib/bliss-head-glyph-exclusions.js';
import { exclusions, exclusionGroups } from '../docs/examples/head-glyph-exclusions.js';

/**
 * Pins the documentation's head glyph exclusions table to the source lists it
 * describes, so a code added to or moved between the lists cannot leave the
 * reference page behind.
 *
 * Covers:
 * - Every code the head pick passes over appears in exactly one of the table's
 *   excluded groups, and no excluded group lists a code the source does not.
 * - The codes deliberately left off the list appear in a group of their own,
 *   marked as not excluded.
 * - The groups whose descriptions name the never-head and low-priority tiers
 *   list exactly the codes the source puts in those tiers.
 * - Every code the table lists has a gloss and a reason, and the table holds
 *   no entry outside its groups.
 * - A code that is not skipped when a given code follows it says so in its
 *   reason, naming that code, and no other reason claims such a rule.
 *
 * Does NOT cover:
 * - Which head a word gets, see `BlissParser.head-glyph-exclusions.test.js`
 *   and `BlissSVGBuilder.head-selection-rule.test.js`.
 * - Whether a gloss is right, which the Blissary lookup decides when the table
 *   is edited, not a test.
 */
describe('bliss-head-glyph-exclusions docs table', () => {
  // The codes of the table's groups that are, or are not, marked excluded.
  const codesOfGroups = (excluded) => exclusionGroups
    .filter((group) => (group.excluded !== false) === excluded)
    .flatMap((group) => group.codes);

  describe('when compared with the source lists', () => {
    it('lists every code the head pick passes over in exactly one excluded group', () => {
      const listed = codesOfGroups(true);
      expect(new Set(listed).size).toBe(listed.length);
      expect([...listed].sort()).toEqual([...blissHeadGlyphExclusions].sort());
    });

    it('lists the codes deliberately left off the list in a group of their own', () => {
      expect(exclusionGroups.filter((group) => group.excluded === false)).toHaveLength(1);
      expect(codesOfGroups(false)).toEqual(deliberatelyNotExcluded);
    });

    it('lists the never-head and low-priority codes in the groups described as those tiers', () => {
      const codesDescribed = (text) => exclusionGroups
        .filter((group) => group.description?.includes(text))
        .flatMap((group) => group.codes);
      expect(codesDescribed('never head')).toEqual(absoluteNeverHead);
      expect(codesDescribed('Low-priority')).toEqual(lowPriorityExclusions);
    });

    it('gives every listed code a gloss and a reason, and holds no entry outside its groups', () => {
      const listed = exclusionGroups.flatMap((group) => group.codes);
      expect(listed.filter((code) => !exclusions[code]?.name || !exclusions[code]?.why)).toEqual([]);
      expect(Object.keys(exclusions).sort()).toEqual([...listed].sort());
    });

    it('states each conditional rule in its code\'s reason, and no other reason claims one', () => {
      const unstated = conditionalExceptions
        .filter(([code, followedBy]) => !exclusions[code]?.why.includes(`not skipped when ${followedBy}`));
      expect(unstated).toEqual([]);
      const claiming = Object.keys(exclusions).filter((code) => exclusions[code].why.includes('not skipped when'));
      expect(claiming).toEqual(conditionalExceptions.map(([code]) => code));
    });
  });
});
