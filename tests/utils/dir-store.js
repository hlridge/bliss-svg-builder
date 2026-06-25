// On-disk reference store for the regeneration engine — the only destructive
// seam (write / remove real files). Kept tiny and separate so it gets its own
// real-temp-dir test (`DirStore.test.js`): a bug here corrupts the committed
// visual-regression baseline. The engine core (`reference-regen.js`) is
// filesystem-free and operates through this store interface.
import fs from 'fs';
import path from 'path';

// Reject anything that is not a bare filename within `dir` before a destructive
// op. A path separator (`/` or `\`), a parent-dir token, or a NUL could escape
// the reference directory on a write or remove. This is a belt-and-suspenders
// guard independent of how the filename was derived (codeToFilename neutralizes
// `/` and `:` but not `\`), so even a future filename-rule change cannot turn a
// write/remove into a path-traversal.
function assertSafeName(name) {
  // Reject only genuine traversal: a path separator, an exact dot/parent token,
  // a NUL, or a name that does not equal its own basename. Legitimate corpus
  // filenames carry ( ) [ ] { } + # @ . , - and decimals, which are all safe.
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name !== path.basename(name)
  ) {
    throw new Error(`unsafe reference filename: ${JSON.stringify(name)}`);
  }
}

export function makeDirStore(dir) {
  const full = (name) => path.join(dir, name);
  return {
    exists: (name) => fs.existsSync(full(name)),
    read: (name) => fs.readFileSync(full(name), 'utf8'),
    list: () => fs.readdirSync(dir).filter((name) => name.endsWith('.svg')),
    // Atomic write: render to a temp sibling then rename over the target, so a
    // crash mid-run (Ctrl-C, ENOSPC, power loss) can never leave a half-written
    // reference that is neither the old nor the new content. The temp suffix is
    // not `.svg`, so a stray temp from a crash is never listed as an orphan.
    write: (name, content) => {
      assertSafeName(name);
      const dest = full(name);
      const tmp = `${dest}.regen-tmp`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, dest);
    },
    remove: (name) => {
      assertSafeName(name);
      fs.unlinkSync(full(name));
    },
  };
}
