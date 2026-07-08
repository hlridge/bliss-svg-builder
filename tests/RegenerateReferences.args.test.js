/**
 * Pins the regeneration CLI's argument parsing: the default is a read-only
 * status, every write-mode is opt-in by an explicit flag, and malformed
 * invocations are rejected rather than silently doing nothing (or, worse, the
 * wrong destructive thing). Importing the CLI module here does NOT run it — main
 * only executes when the file is invoked directly.
 *
 * Covers:
 * - No args (and an explicit `status`) select no write-mode.
 * - Each write flag sets exactly its own mode.
 * - --accept collects names from both `--accept a,b` and `--accept=a,b` forms.
 * - --accept keeps commas INSIDE a filename (derived names carry `#x,y` /
 *   `@ax,ay` coordinate commas): the list separator is a comma following the
 *   `.svg` extension only.
 * - --accept with no names throws.
 * - An unknown flag throws rather than being ignored.
 * - runWriteModes dispatch: a flag runs only its mode; --delete-orphans is a dry
 *   run unless --confirm accompanies it (the irreversible-mode gate).
 *
 * Does NOT cover:
 * - The classify/bucket logic itself: see the ReferenceRegen tests.
 * - The end-to-end main() against the real corpus: that is the engine's real R2
 *   run (Task 11), gated and user-inspected.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs, runWriteModes } from './regenerate-references.js';
import { BUCKET } from './utils/reference-regen.js';

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

const noOpts = () => ({
  addNew: false,
  refreshSafe: false,
  accept: [],
  deleteOrphans: false,
  confirm: false,
  json: false,
  verbose: false,
  help: false,
});

describe('parseArgs', () => {
  describe('when no write flag is given', () => {
    it('defaults every write-mode off', () => {
      const opts = parseArgs([]);

      expect(opts.addNew).toBe(false);
      expect(opts.refreshSafe).toBe(false);
      expect(opts.deleteOrphans).toBe(false);
      expect(opts.accept).toEqual([]);
    });

    it('treats an explicit `status` token as the read-only default', () => {
      expect(parseArgs(['status']).addNew).toBe(false);
    });
  });

  describe('when a write flag is given', () => {
    it('sets only that mode', () => {
      expect(parseArgs(['--add-new']).addNew).toBe(true);
      expect(parseArgs(['--refresh-safe']).refreshSafe).toBe(true);
      expect(parseArgs(['--delete-orphans']).deleteOrphans).toBe(true);
    });
  });

  describe('when accepting changed references', () => {
    it('collects names from the spaced form', () => {
      expect(parseArgs(['--accept', 'B83.svg,B84.svg']).accept).toEqual(['B83.svg', 'B84.svg']);
    });

    it('collects names from the inline = form', () => {
      expect(parseArgs(['--accept=B83.svg,B84.svg']).accept).toEqual(['B83.svg', 'B84.svg']);
    });

    it('keeps a comma-bearing filename intact as one name', () => {
      // regression: 2026-07-08 — the indicator-centering accept named a ref
      // whose derived filename carries coordinate/anchor commas; splitting on
      // every comma shredded it into un-acceptable fragments
      expect(parseArgs(['--accept', 'B291+B97+{B86+SDOT#3,4@-0.5,0}.svg']).accept)
        .toEqual(['B291+B97+{B86+SDOT#3,4@-0.5,0}.svg']);
    });

    it('splits a mixed list only at .svg boundaries', () => {
      expect(parseArgs(['--accept=B291+B98#5,0.svg,B83.svg']).accept)
        .toEqual(['B291+B98#5,0.svg', 'B83.svg']);
    });

    it('throws when no names follow', () => {
      expect(() => parseArgs(['--accept'])).toThrow(/requires/);
    });
  });

  describe('when authorizing an irreversible removal', () => {
    it('records --confirm', () => {
      expect(parseArgs(['--delete-orphans', '--confirm']).confirm).toBe(true);
      expect(parseArgs(['--delete-orphans']).confirm).toBe(false);
    });
  });

  describe('when given an unknown flag', () => {
    it('throws rather than ignoring it', () => {
      expect(() => parseArgs(['--frobnicate'])).toThrow(/unknown argument/);
    });
  });
});

describe('runWriteModes', () => {
  describe('when no write flag is set', () => {
    it('writes nothing', () => {
      const store = makeMemoryStore({ 'orphan.svg': 'O' });
      const results = [{ filename: 'n.svg', bucket: BUCKET.NEW, generated: '<svg/>' }];

      const report = runWriteModes(noOpts(), { results, orphans: ['orphan.svg'], store });

      expect(report).toEqual({});
      expect(store.list()).toEqual(['orphan.svg']);
    });
  });

  describe('when --add-new is set', () => {
    it('runs only add-new', () => {
      const store = makeMemoryStore();
      const results = [{ filename: 'n.svg', bucket: BUCKET.NEW, generated: '<svg>N</svg>' }];

      const report = runWriteModes({ ...noOpts(), addNew: true }, { results, orphans: [], store });

      expect(report.addNew.written).toEqual(['n.svg']);
      expect(report.refreshSafe).toBeUndefined();
      expect(report.deleteOrphans).toBeUndefined();
    });
  });

  describe('when deleting orphans without --confirm', () => {
    it('is a dry run that removes nothing', () => {
      const store = makeMemoryStore({ 'stale.svg': 'S' });

      const report = runWriteModes(
        { ...noOpts(), deleteOrphans: true, confirm: false },
        { results: [], orphans: ['stale.svg'], store },
      );

      expect(report.deleteOrphans.dryRun).toBe(true);
      expect(report.deleteOrphans.removed).toEqual([]);
      expect(report.deleteOrphans.wouldRemove).toEqual(['stale.svg']);
      expect(store.exists('stale.svg')).toBe(true);
    });
  });

  describe('when deleting orphans with --confirm', () => {
    it('removes the orphans', () => {
      const store = makeMemoryStore({ 'stale.svg': 'S' });

      const report = runWriteModes(
        { ...noOpts(), deleteOrphans: true, confirm: true },
        { results: [], orphans: ['stale.svg'], store },
      );

      expect(report.deleteOrphans.dryRun).toBe(false);
      expect(report.deleteOrphans.removed).toEqual(['stale.svg']);
      expect(store.exists('stale.svg')).toBe(false);
    });
  });
});
