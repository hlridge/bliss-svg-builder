/**
 * Pins the reference-SVG regeneration engine's WRITE-MODES: each apply-mode may
 * only touch the bucket it is responsible for, so an intended render change can
 * never be auto-accepted and a markup refresh can never alter a render. These
 * are the safety properties that let the engine be destructive-capable without a
 * silent-rebaseline footgun.
 *
 * Covers:
 * - applyAddNew: writes only New cases, and never overwrites an existing file.
 * - applyRefreshSafe: rewrites markup only on Unchanged cases that drifted, skips
 *   byte-identical ones, and NEVER touches a Changed or New case.
 * - applyAccept: writes only the explicitly named Changed cases, and warns
 *   (without writing) when a named file is Unchanged, New, errored, or unknown.
 * - applyDeleteOrphans: removes exactly the flagged orphan files.
 *
 * Does NOT cover:
 * - How cases are bucketed in the first place: see
 *   `ReferenceRegen.classification.test.js`.
 * - The on-disk store: see `DirStore.test.js`.
 */
import { describe, it, expect } from 'vitest';
import {
  applyAddNew,
  applyRefreshSafe,
  applyAccept,
  applyDeleteOrphans,
  BUCKET,
} from './utils/reference-regen.js';

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

const result = (bucket, filename, extra = {}) => ({
  code: filename.replace(/\.svg$/, ''),
  filename,
  source: 'curated',
  bucket,
  generated: `<svg>${filename}</svg>`,
  ...extra,
});

describe('applyAddNew', () => {
  describe('when there are New cases with no existing file', () => {
    it('writes each New render as its first reference', () => {
      const store = makeMemoryStore();
      const results = [
        result(BUCKET.NEW, 'a.svg'),
        result(BUCKET.NEW, 'b.svg'),
      ];

      const { written } = applyAddNew(results, { store });

      expect(written).toEqual(['a.svg', 'b.svg']);
      expect(store.read('a.svg')).toBe('<svg>a.svg</svg>');
    });
  });

  describe('when a non-New bucket is present', () => {
    it('leaves Unchanged and Changed cases untouched', () => {
      const store = makeMemoryStore({ 'c.svg': 'OLD-CHANGED', 'u.svg': 'OLD-UNCHANGED' });
      const results = [
        result(BUCKET.NEW, 'n.svg'),
        result(BUCKET.CHANGED, 'c.svg'),
        result(BUCKET.UNCHANGED, 'u.svg', { byteIdentical: false }),
      ];

      const { written } = applyAddNew(results, { store });

      expect(written).toEqual(['n.svg']);
      expect(store.read('c.svg')).toBe('OLD-CHANGED');
      expect(store.read('u.svg')).toBe('OLD-UNCHANGED');
    });
  });

  describe('when a New case unexpectedly already exists on disk', () => {
    it('skips it rather than overwriting', () => {
      const store = makeMemoryStore({ 'a.svg': 'PRE-EXISTING' });
      const results = [result(BUCKET.NEW, 'a.svg')];

      const { written, skipped } = applyAddNew(results, { store });

      expect(written).toEqual([]);
      expect(skipped).toEqual(['a.svg']);
      expect(store.read('a.svg')).toBe('PRE-EXISTING');
    });
  });
});

describe('applyRefreshSafe', () => {
  describe('when an Unchanged case drifted in markup', () => {
    it('rewrites the reference with the fresh markup', () => {
      const store = makeMemoryStore({ 'u.svg': 'OLD-MARKUP' });
      const results = [result(BUCKET.UNCHANGED, 'u.svg', { byteIdentical: false })];

      const { refreshed } = applyRefreshSafe(results, { store });

      expect(refreshed).toEqual(['u.svg']);
      expect(store.read('u.svg')).toBe('<svg>u.svg</svg>');
    });
  });

  describe('when an Unchanged case is already byte-identical', () => {
    it('reports it as already-identical and writes nothing', () => {
      const store = makeMemoryStore({ 'u.svg': '<svg>u.svg</svg>' });
      const results = [result(BUCKET.UNCHANGED, 'u.svg', { byteIdentical: true })];

      const { refreshed, alreadyIdentical } = applyRefreshSafe(results, { store });

      expect(refreshed).toEqual([]);
      expect(alreadyIdentical).toEqual(['u.svg']);
    });
  });

  describe('when a Changed case is present', () => {
    it('refuses to touch it (a render-changing file is never refreshed)', () => {
      const store = makeMemoryStore({ 'c.svg': 'OLD-CHANGED', 'n.svg': 'should-not-exist' });
      const results = [
        result(BUCKET.CHANGED, 'c.svg', { byteIdentical: false }),
        result(BUCKET.NEW, 'n.svg'),
      ];

      const { refreshed } = applyRefreshSafe(results, { store });

      expect(refreshed).toEqual([]);
      expect(store.read('c.svg')).toBe('OLD-CHANGED');
    });
  });
});

describe('applyAccept', () => {
  describe('when the named files are Changed', () => {
    it('writes only the named Changed references', () => {
      const store = makeMemoryStore({ 'c1.svg': 'OLD1', 'c2.svg': 'OLD2' });
      const results = [
        result(BUCKET.CHANGED, 'c1.svg', { byteIdentical: false }),
        result(BUCKET.CHANGED, 'c2.svg', { byteIdentical: false }),
      ];

      const { accepted, warnings } = applyAccept(results, ['c1.svg'], { store });

      expect(accepted).toEqual(['c1.svg']);
      expect(warnings).toEqual([]);
      expect(store.read('c1.svg')).toBe('<svg>c1.svg</svg>');
      expect(store.read('c2.svg')).toBe('OLD2'); // not named => untouched
    });
  });

  describe('when a named file is not actually Changed', () => {
    it('warns for Unchanged, New, and unknown names without writing them', () => {
      const store = makeMemoryStore({ 'u.svg': 'OLD-U' });
      const results = [
        result(BUCKET.UNCHANGED, 'u.svg', { byteIdentical: false }),
        result(BUCKET.NEW, 'n.svg'),
      ];

      const { accepted, warnings } = applyAccept(
        results,
        ['u.svg', 'n.svg', 'ghost.svg'],
        { store },
      );

      expect(accepted).toEqual([]);
      expect(warnings).toHaveLength(3);
      expect(warnings.join('\n')).toContain('u.svg');
      expect(warnings.join('\n')).toContain('n.svg');
      expect(warnings.join('\n')).toContain('ghost.svg');
      expect(store.read('u.svg')).toBe('OLD-U');
    });
  });

  describe('when a named file errored during classification', () => {
    it('warns and does not write it', () => {
      const store = makeMemoryStore({ 'e.svg': 'OLD-E' });
      const results = [result(BUCKET.ERROR, 'e.svg', { error: 'render: boom', generated: undefined })];

      const { accepted, warnings } = applyAccept(results, ['e.svg'], { store });

      expect(accepted).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(store.read('e.svg')).toBe('OLD-E');
    });
  });
});

describe('applyDeleteOrphans', () => {
  describe('when there are flagged orphan files', () => {
    it('removes exactly the orphans and nothing else', () => {
      const store = makeMemoryStore({ 'keep.svg': 'K', 'stale1.svg': 'S1', 'stale2.svg': 'S2' });

      const { removed } = applyDeleteOrphans(['stale1.svg', 'stale2.svg'], { store });

      expect(removed).toEqual(['stale1.svg', 'stale2.svg']);
      expect(store.exists('keep.svg')).toBe(true);
      expect(store.exists('stale1.svg')).toBe(false);
      expect(store.exists('stale2.svg')).toBe(false);
    });
  });
});
