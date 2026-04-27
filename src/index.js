import { BlissSVGBuilder } from './lib/bliss-svg-builder.js';
import { LIB_VERSION } from './lib/bliss-constants.js';

// Hoist LIB_VERSION onto the class so IIFE consumers, where
// `window.BlissSVGBuilder` is the class itself, can read the
// version as `BlissSVGBuilder.LIB_VERSION`.
BlissSVGBuilder.LIB_VERSION = LIB_VERSION;

export { BlissSVGBuilder, LIB_VERSION };
export default BlissSVGBuilder;
