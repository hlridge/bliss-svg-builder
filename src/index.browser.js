// Browser-only entry for the IIFE bundle. Importing ./index.js for its
// side effect runs the `BlissSVGBuilder.LIB_VERSION = LIB_VERSION`
// assignment; re-exporting as default makes Rollup's IIFE wrapper
// assign the class itself to `window.BlissSVGBuilder`.
import { BlissSVGBuilder } from './index.js';
export default BlissSVGBuilder;
