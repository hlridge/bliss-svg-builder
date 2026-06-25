// Committed visual-regression corpus index. Promoted from the R2 corpus-expansion
// `.tmp.mjs` tooling (plan 2026-06-24, task 7) at Phase 3 task 10.
//
// Policy (decision 10): every distinct DSL code keeps its OWN reference file, even
// when it currently renders identically to another input. Visual-regression
// references are per-input snapshots: sharing one reference across two different
// inputs couples their baselines (a regen of the "owner" silently redefines the
// other's expected output) and bakes "these two are equal" into the corpus structure
// instead of re-checking it each run. So the only existing-corpus reduction is
// dropping a candidate that is a LITERAL duplicate of a committed case (same DSL code
// -> same render, same filename).
//
// The committed corpus is the FOUR sources the e2e visual-regression test compares
// against (BlissSVGBuilder.visual-regression.e2e.test.js): every registered B-code
// standalone, shapeTests, customTests, and curatedTests -- plus the defs the e2e
// beforeAll registers (the three legacy extension defs + curatedDefs).
import { BlissSVGBuilder } from '../../src/index.js';
import { blissElementDefinitions } from '../../src/lib/bliss-element-definitions.js';
import {
  customTests,
  shapeTests,
  curatedTests,
  curatedDefs,
} from '../BlissSVGBuilder.visual-regression.e2e.cases.js';

export const LEGACY_EXTENSION_DEFS = {
  B291B81: { codeString: 'B291;B81' },
  B291B97: { codeString: 'B291;B97' },
  B291B97B81: { codeString: 'B291;B97;B81' },
};

// All custom defs the e2e suite registers in its beforeAll, in the same order
// (legacy first, then the R13-R16 curated defs). The regeneration engine
// registers exactly this set before rendering, so a corpus code resolves the
// same way it does under the e2e test.
export const CORPUS_DEFS = { ...LEGACY_EXTENSION_DEFS, ...curatedDefs };

// Built-in B-codes captured at MODULE LOAD, before any define() runs. define()
// mutates the shared blissElementDefinitions object (it assigns
// blissElementDefinitions[code] = entry), so the legacy `B...` defs would leak
// into a live `startsWith('B')` scan and double-count. Capturing the pristine
// built-in set here keeps the B-code enumeration stable regardless of later
// registration.
const BUILTIN_B_CODES = Object.keys(blissElementDefinitions).filter((k) => k.startsWith('B'));

// The renderable authoritative corpus: every { code, filename } pair the e2e
// suite compares against, tagged with its source group. This is the single
// enumeration the regeneration engine renders and `buildExistingCorpus` derives
// its sets from, so the two can never drift.
export function buildCorpusCases() {
  // The legacy extension defs (B291B81/B291B97/B291B97B81) are NOT enumerated
  // separately: customTests already lists each as a standalone case (cases.js),
  // exactly as the e2e renders them (its B-code block excludes them — they are
  // not in blissElementDefinitions at describe-collection time). They still need
  // to be REGISTERED for those customTests codes to resolve, which is what
  // CORPUS_DEFS (returned below) is for.
  const cases = [];
  for (const code of BUILTIN_B_CODES) cases.push({ code, filename: `${code}.svg`, source: 'bcode' });
  for (const t of shapeTests) cases.push({ code: t.code, filename: t.filename, source: 'shape' });
  for (const t of customTests) cases.push({ code: t.code, filename: t.filename, source: 'custom' });
  for (const t of curatedTests) cases.push({ code: t.code, filename: t.filename, source: 'curated' });
  return { cases, defs: CORPUS_DEFS };
}

export function buildExistingCorpus() {
  // Register every def the e2e suite relies on so each committed code resolves.
  BlissSVGBuilder.define({ ...CORPUS_DEFS }, { overwrite: true });

  const { cases } = buildCorpusCases();
  const existingCodes = new Set(); // committed DSL codes (for literal-duplicate detection)
  const existingRefs = new Set();  // committed reference filenames (for collision guard)
  for (const c of cases) {
    existingCodes.add(c.code);
    existingRefs.add(c.filename);
  }
  return { existingCodes, existingRefs };
}
