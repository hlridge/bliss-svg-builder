/**
 * Pins the on-disk reference store the regeneration engine writes through. This
 * is the engine's only destructive seam (write / remove real files), so it gets
 * a real-temp-dir test rather than an in-memory fake: a bug here corrupts the
 * committed baseline.
 *
 * Covers:
 * - exists / read reflect what is on disk.
 * - list returns only the `.svg` files in the directory (ignores stray files).
 * - write creates a file and round-trips its content.
 * - write is atomic: it leaves no temporary sibling behind.
 * - remove deletes a file.
 * - write and remove reject a filename that could escape the directory
 *   (path separator, parent-dir token), the destructive-seam safety guard.
 *
 * Does NOT cover:
 * - Bucket logic / which files SHOULD be written: see the ReferenceRegen tests.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeDirStore } from './utils/dir-store.js';

const withTempDir = (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refregen-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('makeDirStore', () => {
  describe('when reading an existing reference dir', () => {
    it('reports existence and reads content', () => {
      withTempDir((dir) => {
        fs.writeFileSync(path.join(dir, 'a.svg'), '<svg>A</svg>');
        const store = makeDirStore(dir);

        expect(store.exists('a.svg')).toBe(true);
        expect(store.exists('missing.svg')).toBe(false);
        expect(store.read('a.svg')).toBe('<svg>A</svg>');
      });
    });

    it('lists only the .svg files, ignoring stray files', () => {
      withTempDir((dir) => {
        fs.writeFileSync(path.join(dir, 'a.svg'), '<svg>A</svg>');
        fs.writeFileSync(path.join(dir, 'b.svg'), '<svg>B</svg>');
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');
        const store = makeDirStore(dir);

        expect(store.list().sort()).toEqual(['a.svg', 'b.svg']);
      });
    });
  });

  describe('when writing and removing references', () => {
    it('creates a file that round-trips its content', () => {
      withTempDir((dir) => {
        const store = makeDirStore(dir);

        store.write('new.svg', '<svg>NEW</svg>');

        expect(fs.readFileSync(path.join(dir, 'new.svg'), 'utf8')).toBe('<svg>NEW</svg>');
        expect(store.read('new.svg')).toBe('<svg>NEW</svg>');
      });
    });

    it('leaves no temporary sibling behind after an atomic write', () => {
      withTempDir((dir) => {
        const store = makeDirStore(dir);

        store.write('atomic.svg', '<svg>A</svg>');

        expect(fs.readdirSync(dir)).toEqual(['atomic.svg']);
      });
    });

    it('deletes a file', () => {
      withTempDir((dir) => {
        fs.writeFileSync(path.join(dir, 'gone.svg'), '<svg>X</svg>');
        const store = makeDirStore(dir);

        store.remove('gone.svg');

        expect(fs.existsSync(path.join(dir, 'gone.svg'))).toBe(false);
      });
    });
  });

  describe('when given a filename that could escape the directory', () => {
    it('refuses to write through a path separator or parent token', () => {
      withTempDir((dir) => {
        const store = makeDirStore(dir);

        expect(() => store.write('../escape.svg', 'x')).toThrow(/unsafe/);
        expect(() => store.write('sub/escape.svg', 'x')).toThrow(/unsafe/);
        expect(() => store.write('back\\escape.svg', 'x')).toThrow(/unsafe/);
      });
    });

    it('refuses to remove through a path separator or parent token', () => {
      withTempDir((dir) => {
        const store = makeDirStore(dir);

        expect(() => store.remove('../escape.svg')).toThrow(/unsafe/);
        expect(() => store.remove('sub/escape.svg')).toThrow(/unsafe/);
      });
    });
  });
});
