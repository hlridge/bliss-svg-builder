// Reference-SVG regeneration CLI — the tracked backbone for managing
// `tests/reference-svgs/` (the visual-regression baseline). Wires the real
// collaborators onto the filesystem-free engine core (`utils/reference-regen.js`):
//   render  = new BlissSVGBuilder(code).standaloneSvg   (the public API)
//   compare = compareRenderToReference                  (the e2e pixel pipeline)
//   store   = makeDirStore(tests/reference-svgs)         (the on-disk seam)
//
// Default mode is a READ-ONLY status: it renders every corpus case, classifies
// each New / Unchanged / Changed / Error against its reference, and flags orphan
// reference files — without writing anything. The corpus is only ever modified by
// an EXPLICIT write flag:
//
//   node tests/regenerate-references.js                 # status (read-only)
//   node tests/regenerate-references.js --add-new       # write New refs (never overwrites)
//   node tests/regenerate-references.js --refresh-safe  # refresh stale markup on pixel-identical refs
//   node tests/regenerate-references.js --accept a.svg,b.svg   # baseline named Changed refs
//   node tests/regenerate-references.js --delete-orphans       # remove refs with no case
//   ... --json        # machine-readable status
//   ... --verbose     # also list every New file
//
// Safety by construction (the silent-rebaseline guard): --refresh-safe can only
// rewrite a file whose render did NOT change; --accept writes only the files you
// explicitly name (warning if a name is not actually Changed); --add-new only
// writes files that do not exist. Intended render changes therefore cannot be
// auto-accepted — a human must name them after inspection.
import path from 'path';
import { fileURLToPath } from 'url';
import { BlissSVGBuilder } from '../src/index.js';
import { buildCorpusCases } from './utils/case-reference.js';
import { compareRenderToReference } from './utils/compare-render.js';
import { makeDirStore } from './utils/dir-store.js';
import {
  classifyCorpus,
  applyAddNew,
  applyRefreshSafe,
  applyAccept,
  applyDeleteOrphans,
  BUCKET,
} from './utils/reference-regen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = path.join(__dirname, 'reference-svgs');

const USAGE = `reference-SVG regeneration engine

  node tests/regenerate-references.js [mode-flags] [--json] [--verbose]

Modes (none = read-only status):
  --add-new          write the first reference for every New case (never overwrites)
  --refresh-safe     refresh stale markup on Unchanged refs (cannot change a render)
  --accept <list>    write only the named Changed refs (comma-separated filenames)
  --delete-orphans   list orphan refs (dry run); add --confirm to actually remove
  --confirm          authorize the irreversible --delete-orphans removal
  --json             print machine-readable status instead of the table
  --verbose          also list every New file
  -h, --help         this message`;

export function parseArgs(argv) {
  const opts = {
    addNew: false,
    refreshSafe: false,
    accept: [],
    deleteOrphans: false,
    confirm: false,
    json: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'status') continue; // default; allowed as an explicit no-op
    else if (arg === '--add-new') opts.addNew = true;
    else if (arg === '--refresh-safe') opts.refreshSafe = true;
    else if (arg === '--delete-orphans') opts.deleteOrphans = true;
    else if (arg === '--confirm') opts.confirm = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--accept' || arg.startsWith('--accept=')) {
      const inline = arg.startsWith('--accept=') ? arg.slice('--accept='.length) : argv[++i];
      const names = (inline ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) throw new Error('--accept requires a comma-separated list of reference filenames');
      opts.accept.push(...names);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function progressReporter() {
  let lastPct = -1;
  return (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct !== lastPct && pct % 10 === 0) {
      process.stderr.write(`  classifying… ${done}/${total} (${pct}%)\n`);
      lastPct = pct;
    }
  };
}

function summarize(results, orphans, counts) {
  const byBucket = (b) => results.filter((r) => r.bucket === b).map((r) => r.filename).sort();
  const driftCount = results.filter((r) => r.bucket === BUCKET.UNCHANGED && r.byteIdentical === false).length;
  const identicalCount = results.filter((r) => r.bucket === BUCKET.UNCHANGED && r.byteIdentical === true).length;
  return {
    counts,
    drift: { markupDrift: driftCount, byteIdentical: identicalCount },
    changed: byBucket(BUCKET.CHANGED),
    errors: results.filter((r) => r.bucket === BUCKET.ERROR).map((r) => ({ filename: r.filename, error: r.error })),
    new: byBucket(BUCKET.NEW),
    orphans: [...orphans].sort(),
  };
}

function printStatus(summary, { verbose }) {
  const { counts, drift, changed, errors, orphans } = summary;
  const total = counts.new + counts.unchanged + counts.changed + counts.error;
  console.log(`\nReference-SVG corpus status (${path.relative(process.cwd(), REFERENCE_DIR)})\n`);
  console.log(`  cases:       ${total}`);
  console.log(`  New:         ${counts.new}\t(no reference yet — write with --add-new)`);
  console.log(`  Unchanged:   ${counts.unchanged}\t(${drift.markupDrift} markup-drift, ${drift.byteIdentical} byte-identical)`);
  console.log(`  Changed:     ${counts.changed}\t(render differs — baseline individually with --accept after inspection)`);
  console.log(`  Error:       ${counts.error}`);
  console.log(`  Orphaned:    ${counts.orphaned}\t(reference with no case — remove with --delete-orphans)`);

  if (changed.length) {
    console.log(`\nChanged (${changed.length}) — inspect each before --accept:`);
    for (const f of changed) console.log(`  ${f}`);
  }
  if (orphans.length) {
    console.log(`\nOrphaned (${orphans.length}):`);
    for (const f of orphans) console.log(`  ${f}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ${e.filename}: ${e.error}`);
  }
  if (verbose && summary.new.length) {
    console.log(`\nNew (${summary.new.length}):`);
    for (const f of summary.new) console.log(`  ${f}`);
  } else if (summary.new.length) {
    console.log(`\n(${summary.new.length} New files — pass --verbose to list, or --json)`);
  }
}

function assertUniqueFilenames(cases) {
  const seen = new Map();
  const collisions = [];
  for (const c of cases) {
    if (seen.has(c.filename) && seen.get(c.filename) !== c.code) {
      collisions.push(`${c.filename}: ${seen.get(c.filename)} vs ${c.code}`);
    } else {
      seen.set(c.filename, c.code);
    }
  }
  if (collisions.length) {
    throw new Error(`corpus integrity: distinct codes map to one filename:\n  ${collisions.join('\n  ')}`);
  }
}

// Dispatch the requested write-modes against the classified corpus, in a
// deterministic safe order, and return a report of exactly what each touched.
// Extracted from main() so the dispatch — especially the irreversible
// delete-orphans gate — is unit-testable with an in-memory store. --add-new /
// --refresh-safe / --accept are individually safe-by-bucket (see
// reference-regen.js), so an explicit flag suffices; --delete-orphans is the one
// irreversible mode (it removes data with no producing case), so it is a DRY RUN
// unless --confirm is also given.
export function runWriteModes(opts, { results, orphans, store }) {
  const report = {};
  if (opts.addNew) report.addNew = applyAddNew(results, { store });
  if (opts.refreshSafe) report.refreshSafe = applyRefreshSafe(results, { store });
  if (opts.accept.length) report.accept = applyAccept(results, opts.accept, { store });
  if (opts.deleteOrphans) {
    report.deleteOrphans = opts.confirm
      ? { ...applyDeleteOrphans(orphans, { store }), dryRun: false }
      : { removed: [], wouldRemove: [...orphans], dryRun: true };
  }
  return report;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const { cases, defs } = buildCorpusCases();
  assertUniqueFilenames(cases);
  BlissSVGBuilder.define({ ...defs }, { overwrite: true });

  const store = makeDirStore(REFERENCE_DIR);
  const render = (code) => new BlissSVGBuilder(code).standaloneSvg;

  const { results, orphans, counts } = await classifyCorpus({
    cases,
    store,
    render,
    compare: compareRenderToReference,
    onProgress: opts.json ? undefined : progressReporter(),
  });

  const summary = summarize(results, orphans, counts);

  if (opts.json && !(opts.addNew || opts.refreshSafe || opts.accept.length || opts.deleteOrphans)) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  printStatus(summary, opts);

  // Write modes (each prints exactly what it touched so a destructive run is
  // never silent).
  const report = runWriteModes(opts, { results, orphans, store });
  if (report.addNew) {
    const { written, skipped } = report.addNew;
    console.log(`\n--add-new: wrote ${written.length} new reference(s)${skipped.length ? `, skipped ${skipped.length} pre-existing` : ''}.`);
  }
  if (report.refreshSafe) {
    const { refreshed, alreadyIdentical } = report.refreshSafe;
    console.log(`\n--refresh-safe: refreshed ${refreshed.length} markup-drifted reference(s), ${alreadyIdentical.length} already byte-identical.`);
  }
  if (report.accept) {
    const { accepted, warnings } = report.accept;
    console.log(`\n--accept: baselined ${accepted.length} changed reference(s).`);
    for (const f of accepted) console.log(`  accepted ${f}`);
    for (const w of warnings) console.log(`  WARNING ${w}`);
  }
  if (report.deleteOrphans) {
    if (report.deleteOrphans.dryRun) {
      console.log(`\n--delete-orphans: DRY RUN — would remove ${report.deleteOrphans.wouldRemove.length} orphan(s). Re-run with --confirm to delete.`);
    } else {
      console.log(`\n--delete-orphans: removed ${report.deleteOrphans.removed.length} orphan reference(s).`);
    }
  }

  return summary;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
