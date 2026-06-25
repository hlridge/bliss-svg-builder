/**
 * Pins the reference-SVG regeneration engine's CLASSIFY core: given the
 * authoritative corpus (each case's code + reference filename), a render
 * function, and the e2e pixel comparator, every case is bucketed
 * New / Unchanged / Changed / Error and every reference file with no case is
 * flagged Orphaned. This classification is the safety hub the write-modes act
 * on (see `ReferenceRegen.apply-modes.test.js`), so a misclassification is the
 * silent-rebaseline bug-class the whole R2 effort fights.
 *
 * Covers:
 * - New: a case whose reference file does not exist yet (the comparator is NOT
 *   consulted — there is nothing to compare against).
 * - Unchanged via byte-identity: render byte-equals the reference (the
 *   comparator is skipped as a fast path).
 * - Unchanged via pixel-identity: render differs in markup bytes but the
 *   comparator reports a match (stale-markup refs that still render identically).
 * - Changed: the comparator reports no match (the intended R16 render diffs).
 * - Error: a render throw is recorded, NOT silently dropped or counted as a pass.
 * - Orphaned: a reference file with no producing case in the corpus.
 *
 * Does NOT cover:
 * - The real pixel comparator itself (injected here as a controlled fake); its
 *   wiring is pinned in `CompareRender.test.js` and its sensitivity in
 *   `visual-comparison.test.js`.
 * - The on-disk write/read/remove store: see `DirStore.test.js`.
 * - What the write-modes DO with each bucket: see `ReferenceRegen.apply-modes.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { classifyCorpus, BUCKET } from './utils/reference-regen.js';

// An in-memory store standing in for the on-disk reference dir. The engine core
// is fs-free; the real disk store is `makeDirStore` (DirStore.test.js).
const makeMemoryStore = (seed = {}) => {
  const files = new Map(Object.entries(seed));
  return {
    exists: (name) => files.has(name),
    read: (name) => files.get(name),
    list: () => [...files.keys()],
    write: (name, content) => files.set(name, content),
    remove: (name) => files.delete(name),
    _files: files,
  };
};

// A controlled comparator: two renders match when they carry the same INK token,
// so a markup-only difference (different data-v) still matches but a real ink
// change does not. Stands in for the canvas pixel comparator.
const inkOf = (svg) => svg.match(/INK:(\w+)/)?.[1] ?? null;
const fakeCompare = async (generated, reference) => {
  const match = inkOf(generated) === inkOf(reference);
  return { match, similarity: match ? 1 : 0.5, diffPixels: match ? 0 : 42 };
};

const svg = (ink, version = 1) => `<svg data-v="${version}">INK:${ink}</svg>`;

describe('classifyCorpus', () => {
  describe('when a case has no reference file yet', () => {
    it('buckets it New without consulting the comparator', async () => {
      const store = makeMemoryStore();
      let compareCalls = 0;
      const compare = async (...args) => { compareCalls++; return fakeCompare(...args); };

      const { results, counts } = await classifyCorpus({
        cases: [{ code: 'NEWCODE', filename: 'new.svg', source: 'curated' }],
        store,
        render: () => svg('A'),
        compare,
      });

      expect(results[0].bucket).toBe(BUCKET.NEW);
      expect(counts.new).toBe(1);
      expect(compareCalls).toBe(0);
    });

    it('retains the generated markup so it can become the first reference', async () => {
      const store = makeMemoryStore();
      const { results } = await classifyCorpus({
        cases: [{ code: 'NEWCODE', filename: 'new.svg', source: 'curated' }],
        store,
        render: () => svg('A'),
        compare: fakeCompare,
      });

      expect(results[0].generated).toBe(svg('A'));
    });
  });

  describe('when the render byte-equals the existing reference', () => {
    it('buckets it Unchanged via the byte-identity fast path', async () => {
      const store = makeMemoryStore({ 'b.svg': svg('A') });
      let compareCalls = 0;
      const compare = async (...args) => { compareCalls++; return fakeCompare(...args); };

      const { results, counts } = await classifyCorpus({
        cases: [{ code: 'B', filename: 'b.svg', source: 'bcode' }],
        store,
        render: () => svg('A'),
        compare,
      });

      expect(results[0].bucket).toBe(BUCKET.UNCHANGED);
      expect(results[0].byteIdentical).toBe(true);
      expect(counts.unchanged).toBe(1);
      expect(compareCalls).toBe(0);
    });
  });

  describe('when the render differs in markup but renders identically', () => {
    it('buckets it Unchanged and flags the markup drift for refresh', async () => {
      const store = makeMemoryStore({ 'b.svg': svg('A', 1) });

      const { results } = await classifyCorpus({
        cases: [{ code: 'B', filename: 'b.svg', source: 'bcode' }],
        store,
        render: () => svg('A', 2), // same ink, newer markup
        compare: fakeCompare,
      });

      expect(results[0].bucket).toBe(BUCKET.UNCHANGED);
      expect(results[0].byteIdentical).toBe(false);
      expect(results[0].similarity).toBe(1);
    });
  });

  describe('when the render diverges visibly from the reference', () => {
    it('buckets it Changed and records the diff magnitude', async () => {
      const store = makeMemoryStore({ 'b.svg': svg('A') });

      const { results, counts } = await classifyCorpus({
        cases: [{ code: 'B', filename: 'b.svg', source: 'bcode' }],
        store,
        render: () => svg('B'), // different ink => no match
        compare: fakeCompare,
      });

      expect(results[0].bucket).toBe(BUCKET.CHANGED);
      expect(results[0].diffPixels).toBe(42);
      expect(counts.changed).toBe(1);
    });
  });

  describe('when rendering a case throws', () => {
    it('records the error rather than counting it as a pass', async () => {
      const store = makeMemoryStore({ 'b.svg': svg('A') });

      const { results, counts } = await classifyCorpus({
        cases: [{ code: 'BROKEN', filename: 'b.svg', source: 'curated' }],
        store,
        render: () => { throw new Error('boom'); },
        compare: fakeCompare,
      });

      expect(results[0].bucket).toBe(BUCKET.ERROR);
      expect(results[0].error).toContain('boom');
      expect(counts.error).toBe(1);
      expect(counts.unchanged).toBe(0);
    });
  });

  describe('when a reference file has no producing case', () => {
    it('flags it Orphaned', async () => {
      const store = makeMemoryStore({ 'kept.svg': svg('A'), 'stale.svg': svg('Z') });

      const { orphans, counts } = await classifyCorpus({
        cases: [{ code: 'KEPT', filename: 'kept.svg', source: 'bcode' }],
        store,
        render: () => svg('A'),
        compare: fakeCompare,
      });

      expect(orphans).toEqual(['stale.svg']);
      expect(counts.orphaned).toBe(1);
    });
  });
});
