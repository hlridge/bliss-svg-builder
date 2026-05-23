import fs from 'fs';

/**
 * Visual-regression HTML report generator and SVG-overlay helpers used by
 * `BlissSVGBuilder.visual-regression.e2e.test.js`.
 *
 * Extracted from the test file 2026-05-11 to keep the test file focused on
 * test logic. Function bodies are byte-identical to the originals; the only
 * intentional changes are:
 *
 *   - `generateHtmlReport(results)` is now `generateHtmlReport(results, reportPath)`
 *     so the helper module does not need to know the test directory layout
 *     (the original derived `path.join(__dirname, '../temp/visual-report.html')`
 *     from the test file's own `__dirname`).
 *   - `normalizeSVGForDisplay` from the legacy file was dead code (zero call
 *     sites in the repo) and is not carried over.
 */

// Function to create SVG overlays for visual comparison
export function createSVGOverlays(generatedSVG, referenceSVG, testId) {
  // Extract viewBox and dimensions from both SVGs
  const genViewBox = extractViewBox(generatedSVG);
  const refViewBox = extractViewBox(referenceSVG);

  // Use the larger viewBox to accommodate both
  const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
  const viewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;
  const svgDimensions = `width="200" height="200"`;

  // Clean both SVGs
  const cleanedGenerated = cleanSVGContent(generatedSVG);
  const cleanedReference = cleanSVGContent(referenceSVG);

  // Create overlay where reference is transparent/gray, generated is black (differences stand out)
  const overlayRefOnGen = `
    <svg ${svgDimensions} viewBox="${viewBoxStr}" xmlns="http://www.w3.org/2000/svg" style="background: #f8f8f8;">
      <defs>
        <style>
          .ref-layer { fill: #dddddd; stroke: #dddddd; opacity: 0.5; }
          .gen-layer { fill: #000000; stroke: #000000; }
        </style>
      </defs>
      <g class="ref-layer">${cleanedReference}</g>
      <g class="gen-layer">${cleanedGenerated}</g>
    </svg>`;

  // Create overlay where generated is transparent/gray, reference is black (opposite view)
  const overlayGenOnRef = `
    <svg ${svgDimensions} viewBox="${viewBoxStr}" xmlns="http://www.w3.org/2000/svg" style="background: #f8f8f8;">
      <defs>
        <style>
          .gen-layer { fill: #dddddd; stroke: #dddddd; opacity: 0.5; }
          .ref-layer { fill: #000000; stroke: #000000; }
        </style>
      </defs>
      <g class="gen-layer">${cleanedGenerated}</g>
      <g class="ref-layer">${cleanedReference}</g>
    </svg>`;

  // Create simple difference view - show both in different colors
  const differenceView = `
    <svg ${svgDimensions} viewBox="${viewBoxStr}" xmlns="http://www.w3.org/2000/svg" style="background: white;">
      <defs>
        <style>
          .generated-parts { fill: #ff4444; stroke: #ff4444; opacity: 0.8; }
          .reference-parts { fill: #4444ff; stroke: #4444ff; opacity: 0.8; }
        </style>
      </defs>
      <g class="generated-parts">${cleanedGenerated}</g>
      <g class="reference-parts">${cleanedReference}</g>
    </svg>`;

  return {
    overlayRefOnGen,
    overlayGenOnRef,
    differenceView
  };
}

// Helper function to extract viewBox from SVG
export function extractViewBox(svgContent) {
  const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
  if (viewBoxMatch) {
    const [x, y, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);
    return { x, y, width, height, string: viewBoxMatch[1] };
  }

  // Fallback: try to get width/height
  const widthMatch = svgContent.match(/width=["']([^"']+)["']/);
  const heightMatch = svgContent.match(/height=["']([^"']+)["']/);
  if (widthMatch && heightMatch) {
    const width = parseInt(widthMatch[1]);
    const height = parseInt(heightMatch[1]);
    return { x: 0, y: 0, width, height, string: `0 0 ${width} ${height}` };
  }

  // Default fallback
  return { x: 0, y: 0, width: 100, height: 100, string: '0 0 100 100' };
}

// Helper function to combine two viewBoxes
export function combineViewBoxes(vb1, vb2) {
  const minX = Math.min(vb1.x, vb2.x);
  const minY = Math.min(vb1.y, vb2.y);
  const maxX = Math.max(vb1.x + vb1.width, vb2.x + vb2.width);
  const maxY = Math.max(vb1.y + vb1.height, vb2.y + vb2.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// Helper function to clean SVG content (remove svg wrapper and problematic elements)
export function cleanSVGContent(svgContent) {
  // Remove XML declaration if present
  let content = svgContent.replace(/<\?xml[^>]*\?>/g, '');

  // Remove the outer <svg> tags and extract inner content
  content = content.replace(/<svg[^>]*>/g, '').replace(/<\/svg>/g, '');

  // Remove any standalone closing SVG tags
  content = content.replace(/<\/svg>/g, '');

  // Clean up any extra whitespace and newlines
  content = content.trim();

  // Remove empty path elements
  content = content.replace(/<path[^>]*d=["'][^"']*["'][^>]*\/>/g, (match) => {
    if (match.includes('d=""') || match.includes("d=''")) {
      return '';
    }
    return match;
  });

  return content;
}

// Function to generate HTML report with SVG overlays
export function generateHtmlReport(results, reportPath) {
  const resultsWithDifferences = results.filter(result => !result.match || result.similarity < 1.0);

  if (resultsWithDifferences.length === 0) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Visual Test Report</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .success { color: green; font-size: 24px; }
      </style>
    </head>
    <body>
      <h1 class="success">All ${results.length} visual tests passed with 100% match! 🎉</h1>
      <p>No visual differences were detected between generated and reference SVGs.</p>
    </body>
    </html>`;

    fs.writeFileSync(reportPath, html);
    console.log(`\nAll visual tests passed! Report generated at: ${reportPath}`);
    return reportPath;
  }

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Visual Test Report</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #f5f5f5;
        padding: 20px;
      }
      .summary {
        max-width: 100%;
        margin: 0 auto 30px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        padding: 30px;
        text-align: center;
      }
      .summary h1 {
        color: #333;
        margin-bottom: 15px;
        font-size: 24px;
      }
      .comparison {
        max-width: 100%;
        margin: 0 auto 40px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        padding: 30px;
      }
      .comparison h2 {
        color: #333;
        margin-bottom: 20px;
        font-size: 20px;
        text-align: center;
      }
      .comparison h2.failure {
        color: #dc3545;
      }
      .viewbox-warning {
        background: #fff3cd;
        border: 1px solid #ffc107;
        color: #856404;
        padding: 15px;
        border-radius: 6px;
        margin-bottom: 20px;
        text-align: center;
      }
      .comparison-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 15px;
        margin-bottom: 20px;
      }
      .comparison-item {
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
        background: white;
      }
      .comparison-item h3 {
        background: #f8f9fa;
        padding: 10px 12px;
        font-size: 13px;
        color: #333;
        border-bottom: 1px solid #e0e0e0;
        text-align: center;
        font-weight: 600;
      }
      .comparison-item-content {
        padding: 15px;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 300px;
        position: relative;
      }
      .comparison-item-content > svg,
      .comparison-item-content > .svg-overlay-wrapper {
        max-width: 100%;
        height: 100%;
        width: auto;
      }
      .comparison-item-content svg {
        display: block;
        border: 0.5px solid #999;
        overflow: visible;
      }
      .svg-overlay-wrapper {
        position: relative;
        display: inline-block;
        height: 100%;
      }
      .svg-overlay-wrapper > svg {
        display: block;
        border: 0.5px solid #999;
        max-width: 100%;
        height: 100%;
        width: auto;
      }
      .svg-overlay-wrapper > svg > svg {
        border: none;
      }
      .overlay-top {
        filter: brightness(0);
        opacity: 1;
      }
      .overlay-bottom-red {
        filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
      }
      .diff-ref {
        filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
      }
      .diff-gen {
        filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
        mix-blend-mode: exclusion;
      }
    </style>
  </head>
  <body>
    <div class="summary">
      <h1>Visual Comparison Report</h1>
      <p>${results.length - resultsWithDifferences.length} of ${results.length} tests passed with 100% match.</p>
      <p>${resultsWithDifferences.length} tests showed differences (shown below).</p>
    </div>
  `;

  resultsWithDifferences.sort((a, b) => a.similarity - b.similarity);

  for (const result of resultsWithDifferences) {
    const status = result.match ? 'success' : 'failure';
    const percentSimilar = (result.similarity * 100).toFixed(4);

    // Extract viewBox from both SVGs
    const genViewBox = extractViewBox(result.generatedSVG);
    const refViewBox = extractViewBox(result.referenceSVG);
    const combinedViewBox = combineViewBoxes(genViewBox, refViewBox);
    const viewBoxStr = `${combinedViewBox.x} ${combinedViewBox.y} ${combinedViewBox.width} ${combinedViewBox.height}`;

    const genViewBoxStr = (genViewBox && genViewBox.string) ? genViewBox.string : viewBoxStr;
    const refViewBoxStr = (refViewBox && refViewBox.string) ? refViewBox.string : viewBoxStr;

    // Clean SVG content
    const cleanedGenerated = cleanSVGContent(result.generatedSVG);
    const cleanedReference = cleanSVGContent(result.referenceSVG);

    const viewBoxWarning = result.viewBoxInfo && !result.viewBoxInfo.match
      ? `<div class="viewbox-warning">
          ⚠️ <strong>ViewBox Mismatch:</strong> Generated: ${result.viewBoxInfo.generated.string} | Reference: ${result.viewBoxInfo.reference.string}
        </div>`
      : '';

    html += `
    <div class="comparison">
      <h2 class="${status}">${result.testName} (${percentSimilar}% similar)</h2>
      ${viewBoxWarning}

      <div class="comparison-grid">
        <div class="comparison-item">
          <h3>Reference</h3>
          <div class="comparison-item-content">
            <svg viewBox="${refViewBoxStr}" width="${Math.abs(refViewBox.width) * 6}" height="${Math.abs(refViewBox.height) * 6}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
              ${cleanedReference}
            </svg>
          </div>
        </div>

        <div class="comparison-item">
          <h3>Generated</h3>
          <div class="comparison-item-content">
            <svg viewBox="${genViewBoxStr}" width="${Math.abs(genViewBox.width) * 6}" height="${Math.abs(genViewBox.height) * 6}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
              ${cleanedGenerated}
            </svg>
          </div>
        </div>

        <div class="comparison-item">
          <h3>SVG Diff</h3>
          <div class="comparison-item-content">
            <div class="svg-overlay-wrapper">
              <svg viewBox="${viewBoxStr}" width="${Math.abs(combinedViewBox.width) * 6}" height="${Math.abs(combinedViewBox.height) * 6}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <svg x="${refViewBox.x}" y="${refViewBox.y}" width="${refViewBox.width}" height="${refViewBox.height}" viewBox="${refViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="diff-ref" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedReference}
                </svg>
                <svg x="${genViewBox.x}" y="${genViewBox.y}" width="${genViewBox.width}" height="${genViewBox.height}" viewBox="${genViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="diff-gen" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedGenerated}
                </svg>
              </svg>
            </div>
          </div>
        </div>

        <div class="comparison-item">
          <h3>Gen over Ref</h3>
          <div class="comparison-item-content">
            <div class="svg-overlay-wrapper">
              <svg viewBox="${viewBoxStr}" width="${Math.abs(combinedViewBox.width) * 6}" height="${Math.abs(combinedViewBox.height) * 6}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <svg x="${refViewBox.x}" y="${refViewBox.y}" width="${refViewBox.width}" height="${refViewBox.height}" viewBox="${refViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="overlay-bottom-red" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedReference}
                </svg>
                <svg x="${genViewBox.x}" y="${genViewBox.y}" width="${genViewBox.width}" height="${genViewBox.height}" viewBox="${genViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="overlay-top" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedGenerated}
                </svg>
              </svg>
            </div>
          </div>
        </div>

        <div class="comparison-item">
          <h3>Ref over Gen</h3>
          <div class="comparison-item-content">
            <div class="svg-overlay-wrapper">
              <svg viewBox="${viewBoxStr}" width="${Math.abs(combinedViewBox.width) * 6}" height="${Math.abs(combinedViewBox.height) * 6}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <svg x="${genViewBox.x}" y="${genViewBox.y}" width="${genViewBox.width}" height="${genViewBox.height}" viewBox="${genViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="overlay-bottom-red" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedGenerated}
                </svg>
                <svg x="${refViewBox.x}" y="${refViewBox.y}" width="${refViewBox.width}" height="${refViewBox.height}" viewBox="${refViewBoxStr}" overflow="visible" preserveAspectRatio="none" class="overlay-top" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
                  ${cleanedReference}
                </svg>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  html += `</body></html>`;

  fs.writeFileSync(reportPath, html);

  if (resultsWithDifferences.length > 0) {
    console.log(`\n❌ Visual differences found! Report generated at: ${reportPath}`);
  } else {
    console.log(`\n✅ All visual tests passed! Report generated at: ${reportPath}`);
  }

  return reportPath;
}
