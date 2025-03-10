// Example Node CommonJS
const { BlissSVGBuilder } = require('../dist/bliss-svg-builder.cjs');

const builder = new BlissSVGBuilder("H:0,8");
console.log(builder.svgCode);