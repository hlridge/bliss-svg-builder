import { execSync } from 'child_process';
import { resolve } from 'path';
import fs from 'fs';

const exec = (cmd, cwd = process.cwd()) => execSync(cmd, { cwd, stdio: 'inherit' });

const createTestIndex = () => {
  const indexHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>BlissSvgBuilder Tests</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .test-link { display: block; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; text-decoration: none; color: #333; }
    .test-link:hover { background: #e0e0e0; }
  </style>
</head>
<body>
  <h1>BlissSvgBuilder Browser Tests</h1>
  <a class="test-link" href="/examples/browser-umd.html" target="_blank">
    <h2>UMD Test</h2>
    <p>Test the UMD build for browsers using global variables</p>
  </a>
  <a class="test-link" href="/examples/browser-esm.html" target="_blank">
    <h2>ESM Test</h2>
    <p>Test the ESM build for modern browsers using ES modules</p>
  </a>
</body>
</html>
  `;
  
  fs.writeFileSync('temp/test-index.html', indexHtml);
  return 'temp/test-index.html';
};

const runConsumptionTests = () => {
  console.log("[Node.js CommonJS] Testing...");
  exec('node examples/node.cjs');

  console.log("\n[Node.js ESM] Testing...");
  exec('node examples/node.esm.js');

  console.log("\n[Browser Tests] Creating test index and launching browser...");
  const indexFile = createTestIndex();
  exec(`npx vite serve --open ${indexFile}`);
};

runConsumptionTests();