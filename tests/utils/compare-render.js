// Render-and-compare core shared by the visual-regression e2e suite and the
// reference-SVG regeneration engine. Hard Constraint 4 of the R2 plan: the
// regeneration engine must classify each case through the SAME pixel pipeline
// the e2e test exercises, so its New/Unchanged/Changed verdict agrees with the
// committed suite. This function IS that pipeline, factored into one place:
//
//   1. extract each viewBox (the report helper's variant, with a default
//      fallback — the same one the e2e test imports);
//   2. if the viewBoxes differ, render both into their COMBINED viewBox so a
//      pure-translation difference does not register as a pixel difference;
//   3. rasterize both to PNG at the 300x300 canvas;
//   4. compare at the committed 0.00001 threshold (the viewBox is also checked
//      exactly inside compareImages when both SVG strings are passed).
//
// The sequence is byte-faithful to the per-case body in
// `BlissSVGBuilder.visual-regression.e2e.test.js`; that test still inlines its
// four copies (DAMP, per its own header). Consolidating the e2e onto this helper
// is a safe follow-up once the corpus is committed (Workstream C).
import { renderSVGToPNG, compareImages } from './visual-comparison.js';
import { extractViewBox, combineViewBoxes } from './visual-report.js';

const CANVAS_SIZE = 300;
const THRESHOLD = 0.00001;

export async function compareRenderToReference(generatedSVG, referenceSVG, testId) {
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
    const combined = combineViewBoxes(genViewBox, refViewBox);
    combinedViewBoxStr = `${combined.x} ${combined.y} ${combined.width} ${combined.height}`;
  }

  const generatedPNG = await renderSVGToPNG(generatedSVG, CANVAS_SIZE, CANVAS_SIZE, combinedViewBoxStr);
  const referencePNG = await renderSVGToPNG(referenceSVG, CANVAS_SIZE, CANVAS_SIZE, combinedViewBoxStr);

  return compareImages(generatedPNG, referencePNG, testId, THRESHOLD, generatedSVG, referenceSVG);
}
