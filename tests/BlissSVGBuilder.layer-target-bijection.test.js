import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { LAYER_TARGETS, CLASS_PREFIX } from '../src/lib/bliss-constants.js';

/**
 * Pins the rule that makes the `<target>--<attribute>` channel a promise rather
 * than an intention: every class the library writes into the markup is a target,
 * spelled without the `bliss-` prefix, and every target names a class some
 * render writes. Both directions are harvested from real renders, so a class
 * added to an emitter is covered the day one of the configurations below emits
 * it, rather than the day someone remembers to add a case here.
 *
 * Covers:
 * - Every class in the markup resolves as a target (catches a class added to an
 *   emitter and to nothing else).
 * - Every target is a class some render writes (catches an `ELEMENT_CLASSES`
 *   entry added before its emitter carries the class, which would resolve, be
 *   listed as available in every `UNKNOWN_LAYER` message, and do nothing).
 * - One generated row per class: a key naming it lands its attribute on every
 *   element carrying that class and on no other.
 *
 * Does NOT cover:
 * - What each target DOES to the picture, see
 *   `BlissSVGBuilder.layer-sub-targets.test.js`.
 * - A class that no render writes yet: a render-based harvest cannot see one.
 *   The `<text>` layer is the known case; under this rule it becomes targetable
 *   the day its emitter writes the class, and the second test below is what
 *   fails if the declaration lands first.
 * - The mirror of that hole: a class written only by a render none of the
 *   configurations makes. Every class today is written through the one helper
 *   that reads the declaration, so a divergence needs an emitter that bypasses
 *   it, but that bypass is exactly what this file guards. **Each new
 *   option-gated emitter owes this file a configuration.**
 * - Refusals and precedence, see `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 */

// Harvested from renders with NO author-supplied class, or the test would demand
// that the author's own class names resolve as targets, which is the one thing
// the rule deliberately excludes.
const CONFIGURATIONS = [
  '[grid;background=beige]||B291',
  '[grid;background-top=red;background-mid=green;background-bottom=blue]||B291',
  '[grid]||B291//H',
  'B291',
];

// A class is one whitespace-separated TOKEN. Substring or \b matching is wrong
// here and quietly so: \b sits between "bliss-grid" and the "-" of
// "bliss-grid-line", so every line path would count as a carrier of bliss-grid.
const classesOf = (line) => (line.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
const carriers = (svg, cls) => svg.split('\n').filter(l => classesOf(l).includes(cls));
const classesIn = (svg) => svg.split('\n').flatMap(classesOf);
const emittedClasses = () =>
  [...new Set(CONFIGURATIONS.flatMap(i => classesIn(new BlissSVGBuilder(i).svgCode)))].sort();
const targetOf = (cls) => cls.slice(CLASS_PREFIX.length);
const probeOf = (input, target) => input.startsWith('[')
  ? input.replace('[', `[${target}--data-probe=x;`)
  : `[${target}--data-probe=x]||${input}`;

describe('BlissSVGBuilder target vocabulary', () => {
  describe('when comparing the classes a render writes to the vocabulary', () => {
    it('writes only classes that are targets', () => {
      for (const cls of emittedClasses()) expect(LAYER_TARGETS.has(targetOf(cls))).toBe(true);
    });

    it('names only targets that some render writes', () => {
      const emitted = new Set(emittedClasses().map(targetOf));
      for (const target of LAYER_TARGETS) expect(emitted.has(target)).toBe(true);
    });
  });

  describe('when a key names each class in turn', () => {
    it.each(
      emittedClasses().map(cls => [cls, targetOf(cls)])
    )('lands an attribute keyed to %s on every element carrying it and no other', (cls, target) => {
      for (const input of CONFIGURATIONS) {
        const plain = new BlissSVGBuilder(input).svgCode;
        if (!classesIn(plain).includes(cls)) continue;

        const probed = new BlissSVGBuilder(probeOf(input, target)).svgCode;
        const expected = carriers(probed, cls);
        const stamped = probed.split('\n').filter(l => l.includes('data-probe="x"'));

        expect(expected.length).toBeGreaterThan(0);
        expect(stamped).toEqual(expected);
      }
    });
  });
});
