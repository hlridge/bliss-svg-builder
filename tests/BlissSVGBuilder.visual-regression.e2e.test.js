/**
 * Pins visual rendering against committed reference SVG fixtures: every
 * predefined Bliss B-code, every shape primitive, and every curated
 * composition produces a PNG-comparable match (similarity ≥ 1 - 0.00001)
 * to the corresponding `tests/reference-svgs/<name>.svg` fixture.
 *
 * Covers:
 * - Per-B-code rendering: every key starting with `B` in
 *   `blissElementDefinitions`, compared to `<code>.svg` reference.
 * - Per-shape rendering: every non-B-code shape primitive in the registry,
 *   compared to a reference whose name follows the case-encoding rules in
 *   `BlissSVGBuilder.visual-regression.e2e.cases.js` (X[u]/X[l] for case
 *   sensitivity).
 * - Curated composition rendering: hand-picked DSL inputs covering kerning,
 *   indicator composition, custom positioning, ZSA, X-prefix sequences,
 *   punctuation spacing, digit kerning, and space-glyph edge cases. See
 *   `BlissSVGBuilder.visual-regression.e2e.cases.js` for the full list.
 * - R13-R16 curated-corpus rendering: head markers (^), word-level ;; overlay,
 *   atypical/baseless indicators, dot-sizing options, strip-semantic, kerning
 *   decimals, custom glyph/indicator defs, and malformed-input fail-render.
 *   Filenames are DERIVED from the code via `tests/utils/case-filename.js`; defs
 *   are registered in `beforeAll`. See the `curatedTests`/`curatedDefs` exports.
 * - viewBox normalization when generated and reference viewBoxes differ.
 * - Indicator-replacement/removal compositions: extends definitions in
 *   `beforeAll` (`B291B81`, `B291B97`, `B291B97B81`) so curated cases can
 *   exercise the `B291B97;B81` style of indicator replacement.
 * - HTML report generation in `afterAll` to `temp/visual-report.html`
 *   (helpers in `tests/utils/visual-report.js`).
 *
 * Does NOT cover:
 * - Anything about SVG structure, attributes, or coordinate math at the
 *   string level: see `BlissSVGBuilder.svg-structure.test.js`.
 * - Rendering correctness outside the fixture set (any glyph/composition
 *   not represented by a reference SVG is implicitly out of scope here;
 *   coverage is the registry's, not this file's).
 * - Built-bundle behaviour: see `BlissSVGBuilder.bundles.dist.test.js`.
 *
 * Note: the file dynamically generates one `it()` per registry entry plus
 * one per curated case (~2230 tests at the time of writing). The §3.2 soft
 * cap is not violated because the test count reflects parameterized
 * coverage, not distinct test scenarios; there are four logical scenarios
 * (B-code rendering, shape-primitive rendering, legacy curated-composition
 * rendering, and R13-R16 curated-corpus rendering), each captured under its
 * own `when …` describe. The per-it comparison body is deliberately inlined
 * four times rather than extracted to a helper (§5.3 forbids helpers with
 * branching/control flow; §12 anti-pattern #4 prefers DAMP over DRY for tests).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderSVGToPNG, compareImages } from './utils/visual-comparison.js';
import {
  createSVGOverlays,
  extractViewBox,
  combineViewBoxes,
  cleanSVGContent,
  generateHtmlReport,
} from './utils/visual-report.js';
import { customTests, shapeTests, curatedTests, curatedDefs } from './BlissSVGBuilder.visual-regression.e2e.cases.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testResults = [];

describe('BlissSVGBuilder visual regression', () => {
  beforeAll(() => {
    // Extend definitions for indicator replacement/removal tests (legacy customTests)
    // plus the R13–R16 curated-corpus defs (full shapes for glyph/indicator kinds).
    BlissSVGBuilder.define({
      B291B81: { codeString: 'B291;B81' },
      B291B97: { codeString: 'B291;B97' },
      B291B97B81: { codeString: 'B291;B97;B81' },
      ...curatedDefs,
    }, { overwrite: true });

    const visualDiffsDir = path.join(__dirname, '../temp/visual-diffs');

    // SAVE_VISUAL_DIFFS='true' preserves prior diffs for inspection across runs;
    // any other value (including 'failures') cleans up so only current failures remain.
    const shouldCleanup = process.env.SAVE_VISUAL_DIFFS !== 'true';

    if (shouldCleanup && fs.existsSync(visualDiffsDir)) {
      console.log('Cleaning up old visual diff files...');
      const files = fs.readdirSync(visualDiffsDir);
      let deletedCount = 0;

      for (const file of files) {
        // Only delete test output files, not the HTML report
        if (file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.html')) {
          const filePath = path.join(visualDiffsDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            // Ignore errors (file might be locked or already deleted)
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`Deleted ${deletedCount} old visual diff files`);
      }
    }
  });

  const codesToTest = Object.keys(blissElementDefinitions)
    .filter(key => key.startsWith('B'));

  describe('when rendering each Bliss B-code from the registry against its reference SVG', () => {
    for (const code of codesToTest) {
      it(`renders ${code} matching tests/reference-svgs/${code}.svg`, async () => {
        const builder = new BlissSVGBuilder(code);
        const generatedSVG = builder.standaloneSvg;

        const referencePath = path.join(__dirname, 'reference-svgs', `${code}.svg`);
        let referenceSVG;
        try {
          referenceSVG = fs.readFileSync(referencePath, 'utf8');
        } catch (error) {
          throw new Error(`Reference SVG not found for ${code}: ${error.message}`);
        }

        const genViewBox = extractViewBox(generatedSVG);
        const refViewBox = extractViewBox(referenceSVG);
        const viewBoxesDiffer = genViewBox && refViewBox && (
          genViewBox.x !== refViewBox.x ||
          genViewBox.y !== refViewBox.y ||
          genViewBox.width !== refViewBox.width ||
          genViewBox.height !== refViewBox.height
        );

        let combinedViewBoxStr = null;
        if (viewBoxesDiffer) {
          const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
          combinedViewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;
        }

        const generatedPNG = await renderSVGToPNG(generatedSVG, 300, 300, combinedViewBoxStr);
        const referencePNG = await renderSVGToPNG(referenceSVG, 300, 300, combinedViewBoxStr);
        const compareResult = await compareImages(generatedPNG, referencePNG, code, 0.00001, generatedSVG, referenceSVG);

        const svgOverlays = createSVGOverlays(generatedSVG, referenceSVG, code);

        testResults.push({
          testName: code,
          match: compareResult.match,
          pixelMatch: compareResult.pixelMatch,
          viewBoxMatch: compareResult.viewBoxMatch,
          similarity: compareResult.similarity,
          generatedSVG: generatedSVG,
          referenceSVG: referenceSVG,
          svgOverlays: svgOverlays,
          paths: compareResult.paths,
          viewBoxInfo: compareResult.viewBoxInfo
        });

        console.log(`\nVisual comparison for ${code}:`);
        console.log(`Similarity: ${(compareResult.similarity * 100).toFixed(2)}%`);
        if (compareResult.viewBoxInfo && !compareResult.viewBoxInfo.match) {
          console.log(`⚠️ ViewBox mismatch: Generated=${compareResult.viewBoxInfo.generated.string}, Reference=${compareResult.viewBoxInfo.reference.string}`);
        }

        let errorMessage = '';
        if (!compareResult.pixelMatch) {
          errorMessage = `Images differ by ${compareResult.diffPixels} pixels (${(100 - compareResult.similarity * 100).toFixed(2)}%). `;
        }
        if (!compareResult.viewBoxMatch) {
          errorMessage += `ViewBox dimensions don't match. `;
        }
        errorMessage += `See diff at ${compareResult.paths.diff}`;

        expect(compareResult.match, errorMessage).toBe(true);
      }, 10000);
    }
  });

  describe('when rendering each non-B-code shape primitive against its reference SVG', () => {
    for (const test of shapeTests) {
      it(`renders code ${test.code} matching tests/reference-svgs/${test.filename}`, async () => {
        const builder = new BlissSVGBuilder(test.code);
        const generatedSVG = builder.standaloneSvg;

        const referencePath = path.join(__dirname, 'reference-svgs', test.filename);
        let referenceSVG;
        try {
          referenceSVG = fs.readFileSync(referencePath, 'utf8');
        } catch (error) {
          throw new Error(`Reference SVG not found for ${test.filename}: ${error.message}`);
        }

        const genViewBox = extractViewBox(generatedSVG);
        const refViewBox = extractViewBox(referenceSVG);
        const viewBoxesDiffer = genViewBox && refViewBox && (
          genViewBox.x !== refViewBox.x ||
          genViewBox.y !== refViewBox.y ||
          genViewBox.width !== refViewBox.width ||
          genViewBox.height !== refViewBox.height
        );

        let combinedViewBoxStr = null;
        if (viewBoxesDiffer) {
          const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
          combinedViewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;
        }

        const generatedPNG = await renderSVGToPNG(generatedSVG, 300, 300, combinedViewBoxStr);
        const referencePNG = await renderSVGToPNG(referenceSVG, 300, 300, combinedViewBoxStr);
        const testId = path.basename(test.filename, path.extname(test.filename));
        const compareResult = await compareImages(generatedPNG, referencePNG, testId, 0.00001, generatedSVG, referenceSVG);

        const svgOverlays = createSVGOverlays(generatedSVG, referenceSVG, testId);

        testResults.push({
          testName: `${test.filename} (${test.code})`,
          match: compareResult.match,
          pixelMatch: compareResult.pixelMatch,
          viewBoxMatch: compareResult.viewBoxMatch,
          similarity: compareResult.similarity,
          generatedSVG: generatedSVG,
          referenceSVG: referenceSVG,
          svgOverlays: svgOverlays,
          paths: compareResult.paths,
          viewBoxInfo: compareResult.viewBoxInfo
        });

        console.log(`\nVisual comparison for ${test.filename} (code: ${test.code}):`);
        console.log(`Similarity: ${(compareResult.similarity * 100).toFixed(2)}%`);
        if (compareResult.viewBoxInfo && !compareResult.viewBoxInfo.match) {
          console.log(`⚠️ ViewBox mismatch: Generated=${compareResult.viewBoxInfo.generated.string}, Reference=${compareResult.viewBoxInfo.reference.string}`);
        }

        let errorMessage = '';
        if (!compareResult.pixelMatch) {
          errorMessage = `Images differ by ${compareResult.diffPixels} pixels (${(100 - compareResult.similarity * 100).toFixed(2)}%). `;
        }
        if (!compareResult.viewBoxMatch) {
          errorMessage += `ViewBox dimensions don't match. `;
        }
        errorMessage += `See diff at ${compareResult.paths.diff}`;

        expect(compareResult.match, errorMessage).toBe(true);
      }, 10000);
    }
  });

  describe('when rendering each curated composition example against its reference SVG', () => {
    for (const test of customTests) {
      it(`renders ${test.filename} from code ${test.code}`, async () => {
        const builder = new BlissSVGBuilder(test.code);
        const generatedSVG = builder.standaloneSvg;

        const referencePath = path.join(__dirname, 'reference-svgs', test.filename);
        let referenceSVG;
        try {
          referenceSVG = fs.readFileSync(referencePath, 'utf8');
        } catch (error) {
          throw new Error(`Reference SVG not found for ${test.filename}: ${error.message}`);
        }

        const genViewBox = extractViewBox(generatedSVG);
        const refViewBox = extractViewBox(referenceSVG);
        const viewBoxesDiffer = genViewBox && refViewBox && (
          genViewBox.x !== refViewBox.x ||
          genViewBox.y !== refViewBox.y ||
          genViewBox.width !== refViewBox.width ||
          genViewBox.height !== refViewBox.height
        );

        let combinedViewBoxStr = null;
        if (viewBoxesDiffer) {
          const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
          combinedViewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;
        }

        const generatedPNG = await renderSVGToPNG(generatedSVG, 300, 300, combinedViewBoxStr);
        const referencePNG = await renderSVGToPNG(referenceSVG, 300, 300, combinedViewBoxStr);
        const testId = path.basename(test.filename, path.extname(test.filename));
        const compareResult = await compareImages(generatedPNG, referencePNG, testId, 0.00001, generatedSVG, referenceSVG);

        const svgOverlays = createSVGOverlays(generatedSVG, referenceSVG, testId);

        testResults.push({
          testName: `${test.filename} (${test.code})`,
          match: compareResult.match,
          pixelMatch: compareResult.pixelMatch,
          viewBoxMatch: compareResult.viewBoxMatch,
          similarity: compareResult.similarity,
          generatedSVG: generatedSVG,
          referenceSVG: referenceSVG,
          svgOverlays: svgOverlays,
          paths: compareResult.paths,
          viewBoxInfo: compareResult.viewBoxInfo
        });

        console.log(`\nVisual comparison for ${test.filename} (code: ${test.code}):`);
        console.log(`Similarity: ${(compareResult.similarity * 100).toFixed(2)}%`);
        if (compareResult.viewBoxInfo && !compareResult.viewBoxInfo.match) {
          console.log(`⚠️ ViewBox mismatch: Generated=${compareResult.viewBoxInfo.generated.string}, Reference=${compareResult.viewBoxInfo.reference.string}`);
        }

        let errorMessage = '';
        if (!compareResult.pixelMatch) {
          errorMessage = `Images differ by ${compareResult.diffPixels} pixels (${(100 - compareResult.similarity * 100).toFixed(2)}%). `;
        }
        if (!compareResult.viewBoxMatch) {
          errorMessage += `ViewBox dimensions don't match. `;
        }
        errorMessage += `See diff at ${compareResult.paths.diff}`;

        expect(compareResult.match, errorMessage).toBe(true);
      }, 10000);
    }
  });

  describe('when rendering each R13-R16 curated corpus case against its reference SVG', () => {
    for (const test of curatedTests) {
      it(`renders ${test.filename} from code ${test.code}`, async () => {
        const builder = new BlissSVGBuilder(test.code);
        const generatedSVG = builder.standaloneSvg;

        const referencePath = path.join(__dirname, 'reference-svgs', test.filename);
        let referenceSVG;
        try {
          referenceSVG = fs.readFileSync(referencePath, 'utf8');
        } catch (error) {
          throw new Error(`Reference SVG not found for ${test.filename}: ${error.message}`);
        }

        const genViewBox = extractViewBox(generatedSVG);
        const refViewBox = extractViewBox(referenceSVG);
        const viewBoxesDiffer = genViewBox && refViewBox && (
          genViewBox.x !== refViewBox.x ||
          genViewBox.y !== refViewBox.y ||
          genViewBox.width !== refViewBox.width ||
          genViewBox.height !== refViewBox.height
        );

        let combinedViewBoxStr = null;
        if (viewBoxesDiffer) {
          const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
          combinedViewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;
        }

        const generatedPNG = await renderSVGToPNG(generatedSVG, 300, 300, combinedViewBoxStr);
        const referencePNG = await renderSVGToPNG(referenceSVG, 300, 300, combinedViewBoxStr);
        const testId = path.basename(test.filename, path.extname(test.filename));
        const compareResult = await compareImages(generatedPNG, referencePNG, testId, 0.00001, generatedSVG, referenceSVG);

        const svgOverlays = createSVGOverlays(generatedSVG, referenceSVG, testId);

        testResults.push({
          testName: `${test.filename} (${test.code})`,
          match: compareResult.match,
          pixelMatch: compareResult.pixelMatch,
          viewBoxMatch: compareResult.viewBoxMatch,
          similarity: compareResult.similarity,
          generatedSVG: generatedSVG,
          referenceSVG: referenceSVG,
          svgOverlays: svgOverlays,
          paths: compareResult.paths,
          viewBoxInfo: compareResult.viewBoxInfo
        });

        console.log(`\nVisual comparison for ${test.filename} (code: ${test.code}):`);
        console.log(`Similarity: ${(compareResult.similarity * 100).toFixed(2)}%`);
        if (compareResult.viewBoxInfo && !compareResult.viewBoxInfo.match) {
          console.log(`⚠️ ViewBox mismatch: Generated=${compareResult.viewBoxInfo.generated.string}, Reference=${compareResult.viewBoxInfo.reference.string}`);
        }

        let errorMessage = '';
        if (!compareResult.pixelMatch) {
          errorMessage = `Images differ by ${compareResult.diffPixels} pixels (${(100 - compareResult.similarity * 100).toFixed(2)}%). `;
        }
        if (!compareResult.viewBoxMatch) {
          errorMessage += `ViewBox dimensions don't match. `;
        }
        errorMessage += `See diff at ${compareResult.paths.diff}`;

        expect(compareResult.match, errorMessage).toBe(true);
      }, 10000);
    }
  });

  afterAll(() => {
    const reportPath = path.join(__dirname, '../temp/visual-report.html');
    generateHtmlReport(testResults, reportPath);
  });
});
