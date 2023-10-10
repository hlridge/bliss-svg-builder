// Example CommonJS
const { BlissSVGBuilder } = require('../dist/bliss-svg-builder.umd.cjs');

const builder = new BlissSVGBuilder("H:0,8");
console.log(builder.svgCode);