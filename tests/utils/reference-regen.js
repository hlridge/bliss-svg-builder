// Reference-SVG regeneration engine — classify core + safe write-modes.
//
// A permanent, tracked backbone (decided 2026-06-25, R2 plan "Regeneration
// engine" section): rather than a throwaway `.tmp` regen script, the corpus is
// managed by ONE classify core feeding several safe apply-modes, so the
// write-rules can never drift between "refresh", "accept", and "add" the way
// three separate scripts would. Drift in write-rules is the silent-rebaseline
// bug-class this whole effort fights.
//
// This module is intentionally filesystem-free: it takes its collaborators
// (a `store`, a `render` function, a `compare` function) as arguments, so the
// classification + write-mode logic is unit-tested with an in-memory store and a
// controlled comparator (see `ReferenceRegen.*.test.js`), while the CLI wires the
// real disk store (`dir-store.js`), the real builder render, and the real e2e
// pixel comparator (`compare-render.js`).
//
// store: {
//   exists(name) -> boolean,
//   read(name)   -> string,
//   list()       -> string[],   // reference filenames present
//   write(name, content) -> void,
//   remove(name) -> void,
// }
// render: (code) -> svgString          (may throw; a throw is recorded, not dropped)
// compare: async (generatedSVG, referenceSVG, testId) -> { match, similarity, diffPixels }

export const BUCKET = {
  NEW: 'new',          // no reference file yet -> first render becomes the ref
  UNCHANGED: 'unchanged', // ref exists, render is pixel-identical (markup may drift)
  CHANGED: 'changed',  // ref exists, render differs -> needs explicit human accept
  ERROR: 'error',      // render (or compare) threw -> never silently a pass
};

const stripExt = (filename) => filename.replace(/\.svg$/i, '');

// Classify every corpus case against its reference, and flag orphan reference
// files (present on disk with no producing case). The comparator is consulted
// ONLY when a reference exists and the render is not already byte-identical to
// it: a New case has nothing to compare, and a byte-identical render is trivially
// Unchanged (the fast path also avoids rasterizing the ~thousands of refs that
// happen to already match exactly).
export async function classifyCorpus({ cases, store, render, compare, onProgress }) {
  const results = [];

  for (let i = 0; i < cases.length; i++) {
    results.push(await classifyCase(cases[i], { store, render, compare }));
    if (onProgress) onProgress(i + 1, cases.length);
  }

  const caseFilenames = new Set(cases.map((c) => c.filename));
  const orphans = store.list().filter((name) => !caseFilenames.has(name));

  return { results, orphans, counts: countBuckets(results, orphans) };
}

async function classifyCase(c, { store, render, compare }) {
  const base = { code: c.code, filename: c.filename, source: c.source };

  let generated;
  try {
    generated = render(c.code);
  } catch (err) {
    return { ...base, bucket: BUCKET.ERROR, error: `render: ${err.message}` };
  }

  if (!store.exists(c.filename)) {
    return { ...base, bucket: BUCKET.NEW, generated };
  }

  const reference = store.read(c.filename);
  if (generated === reference) {
    return { ...base, bucket: BUCKET.UNCHANGED, byteIdentical: true, generated };
  }

  let cmp;
  try {
    cmp = await compare(generated, reference, stripExt(c.filename));
  } catch (err) {
    return { ...base, bucket: BUCKET.ERROR, error: `compare: ${err.message}`, byteIdentical: false, generated };
  }

  return {
    ...base,
    bucket: cmp.match ? BUCKET.UNCHANGED : BUCKET.CHANGED,
    byteIdentical: false,
    similarity: cmp.similarity,
    diffPixels: cmp.diffPixels,
    generated,
  };
}

function countBuckets(results, orphans) {
  const counts = { new: 0, unchanged: 0, changed: 0, error: 0, orphaned: orphans.length };
  for (const r of results) counts[r.bucket]++;
  return counts;
}

// --add-new: a New render becomes its first reference. Never overwrites — if a
// file unexpectedly exists for a case classified New (a classify/disk race), it
// is skipped, not clobbered.
export function applyAddNew(results, { store }) {
  const written = [];
  const skipped = [];
  for (const r of results) {
    if (r.bucket !== BUCKET.NEW) continue;
    if (store.exists(r.filename)) { skipped.push(r.filename); continue; }
    store.write(r.filename, r.generated);
    written.push(r.filename);
  }
  return { written, skipped };
}

// --refresh-safe: refresh stale MARKUP on renders that are already
// pixel-identical (Unchanged). It can only ever rewrite a file whose render did
// not change, so it cannot rebaseline a render. Byte-identical refs need no
// write and are reported separately so a pixel-passing-but-byte-drifting refresh
// is visible, not silently accumulating.
export function applyRefreshSafe(results, { store }) {
  const refreshed = [];
  const alreadyIdentical = [];
  for (const r of results) {
    if (r.bucket !== BUCKET.UNCHANGED) continue;
    if (r.byteIdentical) { alreadyIdentical.push(r.filename); continue; }
    store.write(r.filename, r.generated);
    refreshed.push(r.filename);
  }
  return { refreshed, alreadyIdentical };
}

// --accept <names>: write only the explicitly named Changed references. A name
// that is not actually a Changed case (Unchanged / New / Error / unknown) is
// warned and NOT written, so an intended render change can only be baselined by
// a human naming it after inspection.
export function applyAccept(results, names, { store }) {
  const byFilename = new Map(results.map((r) => [r.filename, r]));
  const accepted = [];
  const warnings = [];
  for (const name of names) {
    const r = byFilename.get(name);
    if (!r) { warnings.push(`${name}: no such case in the corpus`); continue; }
    if (r.bucket === BUCKET.NEW) { warnings.push(`${name}: is New (use --add-new), not accepted`); continue; }
    if (r.bucket === BUCKET.UNCHANGED) { warnings.push(`${name}: is Unchanged, nothing to accept`); continue; }
    if (r.bucket === BUCKET.ERROR) { warnings.push(`${name}: errored (${r.error}), not accepted`); continue; }
    store.write(r.filename, r.generated);
    accepted.push(r.filename);
  }
  return { accepted, warnings };
}

// --delete-orphans: remove reference files with no producing case. Destructive
// and explicit (never part of status or the other modes).
export function applyDeleteOrphans(orphans, { store }) {
  const removed = [];
  for (const name of orphans) {
    store.remove(name);
    removed.push(name);
  }
  return { removed };
}
