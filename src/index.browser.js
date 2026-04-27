// Browser-only entry for the IIFE bundle.
// Importing ./index.js for its side effect runs the
// `BlissSVGBuilder.LIB_VERSION = LIB_VERSION` assignment, so the static
// is set on the class. Re-exporting BlissSVGBuilder as default makes
// Rollup's IIFE wrapper assign the class directly to
// `window.BlissSVGBuilder` (under output.exports: 'default').
import { BlissSVGBuilder } from './index.js';
export default BlissSVGBuilder;
