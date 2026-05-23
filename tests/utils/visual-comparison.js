// tests/utils/visual-comparison.js
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment variable configuration for file saving
// Options: 'true' (save all), 'failures' (save only failures), 'false' (never save)
const SAVE_VISUAL_DIFFS = process.env.SAVE_VISUAL_DIFFS || 'failures';

// Helper function to extract viewBox from SVG string
function extractViewBox(svgString) {
  if (!svgString) return null;

  const viewBoxMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4) {
      return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
        string: viewBoxMatch[1]
      };
    }
  }
  return null;
}

// Function to render SVG to PNG buffer
export async function renderSVGToPNG(svgString, width = 300, height = 300, overrideViewBox = null) {
  // If an override viewBox is provided, replace the SVG's viewBox and dimensions
  let processedSvg = svgString;
  if (overrideViewBox) {
    // Parse the viewBox to get dimensions
    const viewBoxParts = overrideViewBox.split(/\s+/).map(Number);
    const vbWidth = Math.abs(viewBoxParts[2]);
    const vbHeight = Math.abs(viewBoxParts[3]);

    // Calculate appropriate pixel dimensions (scale to match canvas size while preserving aspect ratio)
    const scale = Math.min(width / vbWidth, height / vbHeight);
    const pixelWidth = Math.round(vbWidth * scale);
    const pixelHeight = Math.round(vbHeight * scale);

    // Replace the viewBox attribute in the SVG string
    processedSvg = svgString.replace(
      /viewBox\s*=\s*["'][^"']*["']/i,
      `viewBox="${overrideViewBox}"`
    );

    // Replace width/height attributes with normalized values
    processedSvg = processedSvg.replace(/\s+width\s*=\s*["'][^"']*["']/gi, ` width="${pixelWidth}"`);
    processedSvg = processedSvg.replace(/\s+height\s*=\s*["'][^"']*["']/gi, ` height="${pixelHeight}"`);
  }

  // Create a canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Clear the canvas with a white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // Base64 encode the SVG
  const svgBase64 = Buffer.from(processedSvg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

  // Load image and draw it to canvas
  try {
    const img = await loadImage(dataUrl);
    ctx.drawImage(img, 0, 0);
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error rendering SVG:', error);
    throw error;
  }
}

// Function to create HTML viewer for visual comparison
function createHTMLViewer(htmlPath, testName, files) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Comparison: ${testName}</title>
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
    .container {
      max-width: 100%;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 24px;
      text-align: center;
    }
    .stats {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 30px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 20px;
      font-weight: bold;
      color: ${files.similarity >= 0.9999 ? '#28a745' : '#dc3545'};
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
      min-height: 250px;
    }
    .comparison-item-content img {
      max-width: 100%;
      height: auto;
      display: block;
      border: 0.5px solid #999;
    }
    .comparison-item-content object {
      width: 100%;
      height: 300px;
      border: 0.5px solid #999;
    }
    .svg-overlay-container {
      position: relative;
      width: 100%;
      height: 300px;
    }
    .svg-overlay-container object {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .svg-overlay-container .overlay-top {
      filter: brightness(0);
      opacity: 1;
      pointer-events: none;
    }
    .svg-overlay-container .overlay-bottom-red {
      filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
    }
    .svg-overlay-container .diff-ref {
      filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
    }
    .svg-overlay-container .diff-gen {
      filter: brightness(0) saturate(100%) invert(27%) sepia(98%) saturate(7426%) hue-rotate(358deg) brightness(98%) contrast(118%);
      mix-blend-mode: exclusion;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Visual Comparison: ${testName}</h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Similarity</div>
        <div class="stat-value">${(files.similarity * 100).toFixed(4)}%</div>
      </div>
      <div class="stat">
        <div class="stat-label">Different Pixels</div>
        <div class="stat-value">${files.diffPixels.toLocaleString()}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Pixels</div>
        <div class="stat-value">${files.totalPixels.toLocaleString()}</div>
      </div>
      ${files.viewBoxInfo ? `
      <div class="stat">
        <div class="stat-label">ViewBox Match</div>
        <div class="stat-value" style="color: ${files.viewBoxInfo.match ? '#28a745' : '#dc3545'}">
          ${files.viewBoxInfo.match ? '✓' : '✗'}
        </div>
      </div>
      ` : ''}
    </div>

    ${files.viewBoxInfo && !files.viewBoxInfo.match ? `
    <div class="stats" style="background: #fff3cd; border: 1px solid #ffc107; color: #856404;">
      <div style="width: 100%; text-align: center;">
        <strong>⚠️ ViewBox Mismatch Detected</strong><br>
        <span style="font-size: 12px;">
          Generated: ${files.viewBoxInfo.generated.string} &nbsp;|&nbsp;
          Reference: ${files.viewBoxInfo.reference.string}
        </span>
      </div>
    </div>
    ` : ''}

    <div class="comparison-grid">
      <div class="comparison-item">
        <h3>Reference</h3>
        <div class="comparison-item-content">
          ${files.referenceSvg ?
            `<object type="image/svg+xml" data="${files.referenceSvg}"></object>` :
            `<img src="${files.referencePng}" alt="Reference">`
          }
        </div>
      </div>

      <div class="comparison-item">
        <h3>Generated</h3>
        <div class="comparison-item-content">
          ${files.generatedSvg ?
            `<object type="image/svg+xml" data="${files.generatedSvg}"></object>` :
            `<img src="${files.generatedPng}" alt="Generated">`
          }
        </div>
      </div>

      <div class="comparison-item">
        <h3>SVG Diff</h3>
        <div class="comparison-item-content">
          ${files.referenceSvg && files.generatedSvg ?
            `<div class="svg-overlay-container">
              <object type="image/svg+xml" data="${files.referenceSvg}" class="diff-ref"></object>
              <object type="image/svg+xml" data="${files.generatedSvg}" class="diff-gen"></object>
            </div>` :
            `<img src="${files.diffPng}" alt="Diff">`
          }
        </div>
      </div>

      <div class="comparison-item">
        <h3>Gen over Ref</h3>
        <div class="comparison-item-content">
          ${files.referenceSvg && files.generatedSvg ?
            `<div class="svg-overlay-container">
              <object type="image/svg+xml" data="${files.referenceSvg}" class="overlay-bottom-red"></object>
              <object type="image/svg+xml" data="${files.generatedSvg}" class="overlay-top"></object>
            </div>` :
            `<img src="${files.overlayGenOnRef}" alt="Generated over Reference">`
          }
        </div>
      </div>

      <div class="comparison-item">
        <h3>Ref over Gen</h3>
        <div class="comparison-item-content">
          ${files.referenceSvg && files.generatedSvg ?
            `<div class="svg-overlay-container">
              <object type="image/svg+xml" data="${files.generatedSvg}" class="overlay-bottom-red"></object>
              <object type="image/svg+xml" data="${files.referenceSvg}" class="overlay-top"></object>
            </div>` :
            `<img src="${files.overlayRefOnGen}" alt="Reference over Generated">`
          }
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
}

// Function to calculate image similarity
export async function compareImages(image1Buffer, image2Buffer, testName, threshold = 0.00001, svg1String = null, svg2String = null) {
  // Create directories if they don't exist (only if we'll be saving files)
  const outputDir = path.join(__dirname, '../../temp/visual-diffs');

  // Define paths (for potential saving and return structure)
  const generatedPath = path.join(outputDir, `${testName}-generated.png`);
  const referencePath = path.join(outputDir, `${testName}-reference.png`);
  const diffPath = path.join(outputDir, `${testName}-diff.png`);
  const generatedSvgPath = svg1String ? path.join(outputDir, `${testName}-generated.svg`) : null;
  const referenceSvgPath = svg2String ? path.join(outputDir, `${testName}-reference.svg`) : null;

  // Extract and compare viewBox dimensions
  let viewBoxMismatch = false;
  let viewBoxInfo = null;
  if (svg1String && svg2String) {
    const viewBox1 = extractViewBox(svg1String);
    const viewBox2 = extractViewBox(svg2String);

    if (viewBox1 && viewBox2) {
      const viewBoxMatch =
        viewBox1.x === viewBox2.x &&
        viewBox1.y === viewBox2.y &&
        viewBox1.width === viewBox2.width &&
        viewBox1.height === viewBox2.height;

      if (!viewBoxMatch) {
        viewBoxMismatch = true;
      }

      viewBoxInfo = {
        generated: viewBox1,
        reference: viewBox2,
        match: viewBoxMatch
      };
    }
  }

  // Load images directly from buffers (in-memory operation)
  const img1 = await loadImage(image1Buffer);
  const img2 = await loadImage(image2Buffer);

  // Make sure images are the same size
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Images are not the same size');
  }

  // Create canvases to extract pixel data
  const canvas1 = createCanvas(img1.width, img1.height);
  const ctx1 = canvas1.getContext('2d');
  ctx1.drawImage(img1, 0, 0);

  const canvas2 = createCanvas(img2.width, img2.height);
  const ctx2 = canvas2.getContext('2d');
  ctx2.drawImage(img2, 0, 0);

  // Create a diff canvas
  const diffCanvas = createCanvas(img1.width, img1.height);
  const diffCtx = diffCanvas.getContext('2d');
  diffCtx.fillStyle = 'white';
  diffCtx.fillRect(0, 0, img1.width, img1.height);

  // Define overlay paths (for potential saving)
  const overlay1Path = path.join(outputDir, `${testName}-overlay-ref-on-gen.png`);
  const overlay2Path = path.join(outputDir, `${testName}-overlay-gen-on-ref.png`);

  // Get image data
  const imageData1 = ctx1.getImageData(0, 0, img1.width, img1.height);
  const imageData2 = ctx2.getImageData(0, 0, img2.width, img2.height);
  const diffImageData = diffCtx.createImageData(img1.width, img1.height);

  // Count pixel differences
  let diffPixels = 0;
  const totalPixels = img1.width * img1.height;

  for (let i = 0; i < imageData1.data.length; i += 4) {
    const r1 = imageData1.data[i];
    const g1 = imageData1.data[i + 1];
    const b1 = imageData1.data[i + 2];

    const r2 = imageData2.data[i];
    const g2 = imageData2.data[i + 1];
    const b2 = imageData2.data[i + 2];

    // Check if pixels are different
    if (Math.abs(r1 - r2) > 10 || Math.abs(g1 - g2) > 10 || Math.abs(b1 - b2) > 10) {
      diffPixels++;

      // Highlight differences in red
      diffImageData.data[i] = 255;      // R
      diffImageData.data[i + 1] = 0;    // G
      diffImageData.data[i + 2] = 0;    // B
      diffImageData.data[i + 3] = 255;  // A
    } else {
      // Copy from first image
      diffImageData.data[i] = r1;
      diffImageData.data[i + 1] = g1;
      diffImageData.data[i + 2] = b1;
      diffImageData.data[i + 3] = 255;
    }
  }

  // Put the diff image data to canvas
  diffCtx.putImageData(diffImageData, 0, 0);

  // Calculate similarity percentage
  const similarity = 1 - (diffPixels / totalPixels);

  // Test fails if similarity is below threshold OR viewBox dimensions don't match
  const pixelMatch = similarity >= (1 - threshold);
  const finalMatch = pixelMatch && !viewBoxMismatch;

  // Determine if we should save files
  const shouldSaveFiles =
    SAVE_VISUAL_DIFFS === 'true' ||
    (SAVE_VISUAL_DIFFS === 'failures' && !finalMatch);

  // Only write files to disk if needed
  if (shouldSaveFiles) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create overlay canvases only when saving
    const overlayCanvas1 = createCanvas(img1.width, img1.height);
    const overlayCtx1 = overlayCanvas1.getContext('2d');
    overlayCtx1.drawImage(img1, 0, 0);
    overlayCtx1.globalAlpha = 0.5;
    overlayCtx1.drawImage(img2, 0, 0);

    const overlayCanvas2 = createCanvas(img1.width, img1.height);
    const overlayCtx2 = overlayCanvas2.getContext('2d');
    overlayCtx2.drawImage(img2, 0, 0);
    overlayCtx2.globalAlpha = 0.5;
    overlayCtx2.drawImage(img1, 0, 0);

    // Save PNG files
    fs.writeFileSync(generatedPath, image1Buffer);
    fs.writeFileSync(referencePath, image2Buffer);
    fs.writeFileSync(diffPath, diffCanvas.toBuffer('image/png'));
    fs.writeFileSync(overlay1Path, overlayCanvas1.toBuffer('image/png'));
    fs.writeFileSync(overlay2Path, overlayCanvas2.toBuffer('image/png'));

    // Save SVG files if provided
    if (svg1String && generatedSvgPath) {
      fs.writeFileSync(generatedSvgPath, svg1String);
    }
    if (svg2String && referenceSvgPath) {
      fs.writeFileSync(referenceSvgPath, svg2String);
    }
  }

  return {
    match: finalMatch,
    pixelMatch: pixelMatch,
    viewBoxMatch: !viewBoxMismatch,
    similarity: similarity,
    diffPixels: diffPixels,
    totalPixels: totalPixels,
    viewBoxInfo: viewBoxInfo,
    paths: {
      generated: generatedPath,
      reference: referencePath,
      diff: diffPath,
      overlayRefOnGen: overlay1Path,
      overlayGenOnRef: overlay2Path,
      generatedSvg: generatedSvgPath,
      referenceSvg: referenceSvgPath
    },
    filesSaved: shouldSaveFiles
  };
}

// Custom matcher for Vitest
export function toMatchImage(received, expected, threshold = 0.00001) {
  return {
    async pass() {
      const result = await compareImages(received, expected, threshold);
      return result.match;
    },
    async message() {
      const result = await compareImages(received, expected, threshold);
      if (result.match) {
        return `Expected images to be different, but they are similar (${(result.similarity * 100).toFixed(2)}% similar).`;
      } else {
        return `EXACT MATCH REQUIRED: Images differ by ${result.diffPixels} pixels (${(result.similarity * 100).toFixed(6)}% similar).`;
      }
    }
  };
}

// Extend Vitest's expect
expect.extend({
  toMatchImage
});
