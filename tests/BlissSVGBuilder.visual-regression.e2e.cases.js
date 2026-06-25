import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';
import { codeToFilename } from './utils/case-filename.js';

/**
 * Curated DSL inputs for the visual-regression suite, each paired with the
 * reference-SVG filename it is compared against. Three exported case lists:
 *
 * - shapeTests   — every non-B-code shape primitive, derived from the registry.
 * - customTests  — the legacy hand-built composition corpus (explicit filenames).
 * - curatedTests — the R13–R16 corpus (2026-06-25), DERIVED: each filename is
 *                  computed from the code + curatedDefs via codeToFilename so it
 *                  is byte-identical to what the reference-SVG regeneration engine
 *                  computes (a baked filename could silently mismatch the engine).
 *
 * Each test object is { filename, code }: filename names the SVG in
 * `tests/reference-svgs/`, code is the input to BlissSVGBuilder.
 *
 * CONVERSION KEY for derived filenames (single source of truth in
 * `tests/utils/case-filename.js`; alias names are dropped and replaced by their
 * bracketed, flattened expansion — `(…)` bare alias, `[…]` glyph, `{…}` indicator):
 *   //  → __     (word separator)
 *   /   → _      (character separator)
 *   ;;  → ++     (word-level indicator overlay)
 *   ;   → +      (character-level indicator / part)
 *   :   → #      (position / parameter suffix)
 *   @ax,ay       a def's anchorOffset, inside […]/{…} after the codeString.
 * Untouched: B-codes, shape codes, ^ (head marker), ! (strip-semantic), digits,
 * coordinates. OPTION cases ([opt]||content) get no rule mapping (codeToFilename
 * returns null) and keep a curated `opt-…` name.
 *
 * shapeTests/customTests additionally use the case-sensitivity rule
 * `X[u]A` vs `X[l]a` for external characters (handled inline below, NOT by
 * codeToFilename).
 */

// Shape tests - all non-character shapes
const shapeCodes = Object.keys(blissElementDefinitions)
  .filter(code => !code.startsWith('B'))
  .sort();

// Map shape codes to filenames (handling case-sensitive external characters)
export const shapeTests = shapeCodes.map(code => {
  let filename = code;

  // Handle external character case sensitivity (X + letter)
  // Uses Unicode category detection for proper uppercase/lowercase handling
  if (code.startsWith('X') && code.length === 2) {
    const secondChar = code[1];
    // Check if character is uppercase (includes Latin, Latin Extended, Cyrillic, etc.)
    if (secondChar === secondChar.toUpperCase() && secondChar !== secondChar.toLowerCase()) {
      filename = `X[u]${secondChar}`;
    } else if (secondChar === secondChar.toLowerCase() && secondChar !== secondChar.toUpperCase()) {
      filename = `X[l]${secondChar}`;
    }
    // Characters that are neither upper nor lower (like digits) keep their original form
  }

  return {
    filename: `${filename}.svg`,
    code: code
  };
});

// Custom composition tests
export const customTests = [
  //Base character + indicator, Base character wider than indicator
  { filename: 'B291+B81.svg', code: 'B291;B81' },
  { filename: 'B291+B82.svg', code: 'B291;B82' },
  { filename: 'B291+B83.svg', code: 'B291;B83' },
  { filename: 'B291+B84.svg', code: 'B291;B84' },
  { filename: 'B291+B85.svg', code: 'B291;B85' },
  { filename: 'B291+B86.svg', code: 'B291;B86' },
  { filename: 'B291+B87.svg', code: 'B291;B87' },
  { filename: 'B291+B88.svg', code: 'B291;B88' },
  { filename: 'B291+B89.svg', code: 'B291;B89' },
  { filename: 'B291+B90.svg', code: 'B291;B90' },
  { filename: 'B291+B91.svg', code: 'B291;B91' },
  { filename: 'B291+B92.svg', code: 'B291;B92' },
  { filename: 'B291+B93.svg', code: 'B291;B93' },
  { filename: 'B291+B94.svg', code: 'B291;B94' },
  { filename: 'B291+B95.svg', code: 'B291;B95' },
  { filename: 'B291+B96.svg', code: 'B291;B96' },
  { filename: 'B291+B97.svg', code: 'B291;B97' },
  { filename: 'B291+B98.svg', code: 'B291;B98' },
  { filename: 'B291+B99.svg', code: 'B291;B99' },
  { filename: 'B291+B902.svg', code: 'B291;B902' },
  { filename: 'B291+B903.svg', code: 'B291;B903' },
  { filename: 'B291+B904.svg', code: 'B291;B904' },
  { filename: 'B291+B905.svg', code: 'B291;B905' },
  { filename: 'B291+B906.svg', code: 'B291;B906' },
  { filename: 'B291+B907.svg', code: 'B291;B907' },
  { filename: 'B291+B908.svg', code: 'B291;B908' },
  { filename: 'B291+B909.svg', code: 'B291;B909' },
  { filename: 'B291+B910.svg', code: 'B291;B910' },
  { filename: 'B291+B911.svg', code: 'B291;B911' },
  { filename: 'B291+B912.svg', code: 'B291;B912' },
  { filename: 'B291+B913.svg', code: 'B291;B913' },
  { filename: 'B291+B914.svg', code: 'B291;B914' },
  { filename: 'B291+B915.svg', code: 'B291;B915' },
  { filename: 'B291+B916.svg', code: 'B291;B916' },
  { filename: 'B291+B928.svg', code: 'B291;B928' },
  { filename: 'B291+B992.svg', code: 'B291;B992' },
  { filename: 'B291+B5996.svg', code: 'B291;B5996' },
  { filename: 'B291+B5997.svg', code: 'B291;B5997' },
  { filename: 'B291+B5998.svg', code: 'B291;B5998' },
  //Base character + indicator, indicator wider than base character
  { filename: 'B428+B81.svg', code: 'B428;B81' },
  { filename: 'B428+B82.svg', code: 'B428;B82' },
  { filename: 'B428+B83.svg', code: 'B428;B83' },
  { filename: 'B428+B84.svg', code: 'B428;B84' },
  { filename: 'B428+B85.svg', code: 'B428;B85' },
  { filename: 'B428+B86.svg', code: 'B428;B86' },
  { filename: 'B428+B87.svg', code: 'B428;B87' },
  { filename: 'B428+B88.svg', code: 'B428;B88' },
  { filename: 'B428+B89.svg', code: 'B428;B89' },
  { filename: 'B428+B90.svg', code: 'B428;B90' },
  { filename: 'B428+B91.svg', code: 'B428;B91' },
  { filename: 'B428+B92.svg', code: 'B428;B92' },
  { filename: 'B428+B93.svg', code: 'B428;B93' },
  { filename: 'B428+B94.svg', code: 'B428;B94' },
  { filename: 'B428+B95.svg', code: 'B428;B95' },
  { filename: 'B428+B96.svg', code: 'B428;B96' },
  { filename: 'B428+B97.svg', code: 'B428;B97' },
  { filename: 'B428+B98.svg', code: 'B428;B98' },
  { filename: 'B428+B99.svg', code: 'B428;B99' },
  { filename: 'B428+B902.svg', code: 'B428;B902' },
  { filename: 'B428+B903.svg', code: 'B428;B903' },
  { filename: 'B428+B904.svg', code: 'B428;B904' },
  { filename: 'B428+B905.svg', code: 'B428;B905' },
  { filename: 'B428+B906.svg', code: 'B428;B906' },
  { filename: 'B428+B907.svg', code: 'B428;B907' },
  { filename: 'B428+B908.svg', code: 'B428;B908' },
  { filename: 'B428+B909.svg', code: 'B428;B909' },
  { filename: 'B428+B910.svg', code: 'B428;B910' },
  { filename: 'B428+B911.svg', code: 'B428;B911' },
  { filename: 'B428+B912.svg', code: 'B428;B912' },
  { filename: 'B428+B913.svg', code: 'B428;B913' },
  { filename: 'B428+B914.svg', code: 'B428;B914' },
  { filename: 'B428+B915.svg', code: 'B428;B915' },
  { filename: 'B428+B916.svg', code: 'B428;B916' },
  { filename: 'B428+B928.svg', code: 'B428;B928' },
  { filename: 'B428+B992.svg', code: 'B428;B992' },
  { filename: 'B428+B5996.svg', code: 'B428;B5996' },
  { filename: 'B428+B5997.svg', code: 'B428;B5997' },
  { filename: 'B428+B5998.svg', code: 'B428;B5998' },
  //Base character + indicator, single indicator wider than base character,
  //followed by another base character
  { filename: 'B428+B99_B291.svg', code: 'B428;B99/B291' },
  //Base character + indicator, combined indicator wider than base character,
  //followed by another base character
  { filename: 'B428+B902_B291.svg', code: 'B428;B902/B291' },
  
  /*{ filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },
  { filename: '.svg', code: '' },*/

  //Code RK, two characters with relative kerning in between
  { filename: 'B291_RK#-1_B291.svg', code: 'B291/RK:-1/B291' },
  { filename: 'B291_RK#0_B291.svg', code: 'B291/RK:0/B291' },
  { filename: 'B291_RK#1_B291.svg', code: 'B291/RK:1/B291' },
  //Code AK, two characters with absolute kerning in between
  { filename: 'B291_AK#0_B291.svg', code: 'B291/AK:0/B291' },
  { filename: 'B291_AK#1_B291.svg', code: 'B291/AK:1/B291' },
  { filename: 'B291_AK#2_B291.svg', code: 'B291/AK:2/B291' },
  { filename: 'B291_AK#3_B291.svg', code: 'B291/AK:3/B291' },
  //Code /, standard space between characters
  { filename: 'B291_B291.svg', code: 'B291/B291' },
  //Code //, full space between words
  { filename: 'B291__B291.svg', code: 'B291//B291' },
  //Sequenced indicator followed by another indicator
  { filename: 'B98_B97.svg', code: 'B98/B97' },
  { filename: 'B98_B97_B97.svg', code: 'B98/B97/B97' },
  { filename: 'B5998_B97.svg', code: 'B5998/B97' },
  { filename: 'B5998_B97_B97.svg', code: 'B5998/B97/B97' },

  //Complex composition with multiple words and relative kerning
  { filename: 'B291_RK#-1_B291_RK#1_B291__B291_RK#-1_B291_RK#1_B292__B291_RK#-1_B291_RK#1_B291.svg', code: 'B291/RK:-1/B291/RK:1/B291//B291/RK:-1/B291/RK:1/B292//B291/RK:-1/B291/RK:1/B291' },

  //Base character {Enclosure} + indicator with custom positioning (x,y offsets)
  { filename: 'B291+B99#-1,0.svg', code: 'B291;B99:-1,0' },
  { filename: 'B291+B99#0,0.svg', code: 'B291;B99:0,0' },
  { filename: 'B291+B99#1,0.svg', code: 'B291;B99:1,0' },
  { filename: 'B291+B99#.svg', code: 'B291;B99:' },
  { filename: 'B291+B99#,0.svg', code: 'B291;B99:,0' },
  { filename: 'B291+B99#3,0.svg', code: 'B291;B99:3,0' },
  { filename: 'B291+B99#7,0.svg', code: 'B291;B99:7,0' },
  { filename: 'B291+B99#,4.svg', code: 'B291;B99:,4' },
  { filename: 'B291+B99#,8.svg', code: 'B291;B99:,8' },

  //Raised base character {God} + indicator with positioning
  { filename: 'B355+B99.svg', code: 'B355;B99' },
  { filename: 'B355+B99#3,-4.svg', code: 'B355;B99:3,-4' },
  { filename: 'B355+B99#,0.svg', code: 'B355;B99:,0' },
  { filename: 'B355+B86#-2,-2.svg', code: 'B355;B86:-2,-2' },

  //ZSA (Zero-Sized Anchor) tests
  { filename: 'B291+ZSA#10.svg', code: 'B291;ZSA:10' },
  { filename: 'ZSA+B291#2.svg', code: 'ZSA;B291:2' },

  //Base character + indicator followed by base character
  { filename: 'B291_B428+B902_B291.svg', code: 'B291/B428;B902/B291' },
  { filename: 'B291_B428+B902.svg', code: 'B291/B428;B902' },

  //Wider base character + indicator
  { filename: 'B109+B99.svg', code: 'B109;B99' },
  { filename: 'B109+B99__B291.svg', code: 'B109;B99//B291' },

  //Indicator replacement and removal tests (using extended definitions)
  { filename: 'B291B81.svg', code: 'B291B81' },  // B291;B81 as definition
  { filename: 'B291B97.svg', code: 'B291B97' },  // B291;B97 as definition
  { filename: 'B291B97B81.svg', code: 'B291B97B81' },  // B291;B97;B81 as definition
  { filename: 'B291B81+B81.svg', code: 'B291B81;B81' },  // Replace B81 with B81 (no change)
  { filename: 'B291B97+B81.svg', code: 'B291B97;B81' },  // B81 (verbal) + B97 preserved last
  { filename: 'B291B97B81+B81.svg', code: 'B291B97B81;B81' },  // B81 (verbal) + B97 preserved last
  { filename: 'B291B81+B97+B81.svg', code: 'B291B81;B97;B81' },  // Replace B81 with B97 and B81
  { filename: 'B291B97+B97+B81.svg', code: 'B291B97;B97;B81' },  // Keep B97, add B81
  { filename: 'B291B81+.svg', code: 'B291B81;' },  // Remove B81
  { filename: 'B291B97B81+.svg', code: 'B291B97B81;' },  // Preserve B97 (semantic)

  //Characters with word and character spacing
  { filename: 'B423_B291__B291__B291.svg', code: 'B423/B291//B291//B291' },
  { filename: 'B428+B92__B428+B92_B428+B92.svg', code: 'B428;B92//B428;B92/B428;B92' },

  //Mixed kerning (relative and absolute)
  { filename: 'B291_RK#-3_B291_AK#4_B291.svg', code: 'B291/RK:-3/B291/AK:4/B291' },

  //Complex composition with custom characters
  { filename: 'Xa_Xb_Xc_RK#-7_B81_RK#3_B374.svg', code: 'Xa/Xb/Xc/RK:-7/B81/RK:3/B374' },

  //External character sequences with built-in kerning
  { filename: 'XA_XV_XA.svg', code: 'XA/XV/XA' },
  { filename: 'XA_XB_XC.svg', code: 'XA/XB/XC' },

  //External character (B118: abc) with indicator
  { filename: 'B118+B99.svg', code: 'B118;B99' },

  //External characters as Bliss ID's vs Character codes.
  { filename: 'B70_B70_B70.svg', code: 'B70/B70/B70' },
  { filename: 'XP_XP_XP.svg', code: 'XP/XP/XP' },
  { filename: 'XP.svg', code: 'XP' },

  //Indicators before and after the fact
  { filename: 'B98.svg', code: 'B98' },
  { filename: 'B85.svg', code: 'B85' },

  //Indicator positioning variations
  { filename: 'B428+B99#-3.svg', code: 'B428;B99:-3' },
  { filename: 'B428+B99#-1.svg', code: 'B428;B99:-1' },
  { filename: 'B428+B99#0.svg', code: 'B428;B99:0' },
  { filename: 'B428+B99#1.svg', code: 'B428;B99:1' },

  //Punctuation placement after words (using reduced punctuation-space)
  //Basic punctuation marks (B1-B7) after words
  { filename: 'B313__B4.svg', code: 'B313//B4' },  // Word followed by period (B4)
  { filename: 'B313__B5.svg', code: 'B313//B5' },  // Word followed by comma (B5)
  { filename: 'B291__B1.svg', code: 'B291//B1' },  // Word followed by question mark (B1)
  { filename: 'B291__B2.svg', code: 'B291//B2' },  // Word followed by exclamation (B2)
  { filename: 'B291__B3.svg', code: 'B291//B3' },  // Word followed by interrobang-like (B3)
  { filename: 'B313__B6.svg', code: 'B313//B6' },  // Word followed by colon-like (B6)
  { filename: 'B313__B7.svg', code: 'B313//B7' },  // Word followed by mid-height comma (B7)

  //Combined punctuation characters
  { filename: 'B313__B4_B5.svg', code: 'B313//B4/B5' },  // Word followed by period+comma
  { filename: 'B291__B1_B4.svg', code: 'B291//B1/B4' },  // Word followed by question+period
  { filename: 'B313__B1_B4_B5.svg', code: 'B313//B1/B4/B5' },  // Word followed by triple punctuation
  { filename: 'B291__B6_B4.svg', code: 'B291//B6/B4' },  // Word followed by colon+period

  //Word-punctuation-word patterns (punctuation followed by normal word spacing)
  { filename: 'B291__B5__B291.svg', code: 'B291//B5//B291' },  // Word, comma, word
  { filename: 'B313__B4__B313.svg', code: 'B313//B4//B313' },  // Word, period, word
  { filename: 'B313__B1__B313.svg', code: 'B313//B1//B313' },  // Word, question, word
  { filename: 'B313__B4__B313__B5__B313.svg', code: 'B313//B4//B313//B5//B313' },  // Multiple words with punctuation

  //Sentence patterns with punctuation
  { filename: 'B313__B291__B4.svg', code: 'B313//B291//B4' },  // Two words then period
  { filename: 'B313__B291__B1.svg', code: 'B313//B291//B1' },  // Two words then question mark
  { filename: 'B313__B291__B2.svg', code: 'B313//B291//B2' },  // Two words then exclamation
  { filename: 'B313__B291__B5__B313__B4.svg', code: 'B313//B291//B5//B313//B4' },  // Sentence with comma and period

  //Comparison: normal word spacing vs punctuation spacing
  { filename: 'B313__B313.svg', code: 'B313//B313' },  // Two normal words (word-space=8)
  { filename: 'B291__B291.svg', code: 'B291//B291' },  // Two normal words (different character)

  //All punctuation marks in sequence
  { filename: 'B313__B1__B313__B2__B313__B4__B313__B5.svg', code: 'B313//B1//B313//B2//B313//B4//B313//B5' },

  //Complex sentence patterns
  { filename: 'B313__B291__B5__B313__B291__B4.svg', code: 'B313//B291//B5//B313//B291//B4' },  // Complex sentence
  { filename: 'B313__B291__B313__B4.svg', code: 'B313//B291//B313//B4' },  // Three words, period

  //Digit kerning (regular digits B9-B18)
  { filename: 'B9_B10.svg', code: 'B9/B10' },  // Two regular digits with kerning
  { filename: 'B9_B10_B11.svg', code: 'B9/B10/B11' },  // Three regular digits with kerning
  { filename: 'B9_B10_B11_B12_B13.svg', code: 'B9/B10/B11/B12/B13' },  // Five regular digits
  { filename: 'B9_B10_B11_B12_B13_B14_B15_B16_B17_B18.svg', code: 'B9/B10/B11/B12/B13/B14/B15/B16/B17/B18' },  // All ten regular digits
  { filename: 'B9_B313.svg', code: 'B9/B313' },  // Digit followed by non-digit (no kerning)
  { filename: 'B313_B9.svg', code: 'B313/B9' },  // Non-digit followed by digit (no kerning)

  //Digit kerning (small digits B19-B28)
  { filename: 'B19_B20.svg', code: 'B19/B20' },  // Two small digits with kerning
  { filename: 'B19_B20_B21.svg', code: 'B19/B20/B21' },  // Three small digits with kerning
  { filename: 'B19_B20_B21_B22_B23.svg', code: 'B19/B20/B21/B22/B23' },  // Five small digits
  { filename: 'B19_B20_B21_B22_B23_B24_B25_B26_B27_B28.svg', code: 'B19/B20/B21/B22/B23/B24/B25/B26/B27/B28' },  // All ten small digits
  { filename: 'B19_B313.svg', code: 'B19/B313' },  // Small digit followed by non-digit (no kerning)
  { filename: 'B313_B19.svg', code: 'B313/B19' },  // Non-digit followed by small digit (no kerning)

  //Mixed digit types (no kerning between different digit groups)
  { filename: 'B9_B19.svg', code: 'B9/B19' },  // Regular digit + small digit (no kerning)
  { filename: 'B19_B9.svg', code: 'B19/B9' },  // Small digit + regular digit (no kerning)
  { filename: 'B9_B10_B313_B19_B20.svg', code: 'B9/B10/B313/B19/B20' },  // Mixed sequence

  //Digit kerning across word boundaries (no kerning, normal word spacing)
  { filename: 'B9__B10.svg', code: 'B9//B10' },  // Regular digits in separate words
  { filename: 'B19__B20.svg', code: 'B19//B20' },  // Small digits in separate words

  //Comparison: with and without digit kerning
  { filename: 'B9_B10_B11__B291_B291_B291.svg', code: 'B9/B10/B11//B291/B291/B291' },  // Digits vs non-digits spacing

  //Space glyph edge cases - invisible SVGs (only margins, no visible content)
  { filename: 'space-only-empty.svg', code: '' },  // Empty string
  { filename: 'space-only-single-slash.svg', code: '/' },  // Single glyph separator
  { filename: 'space-only-double-slash.svg', code: '//' },  // Empty - word separator only
  { filename: 'space-only-triple-slash.svg', code: '///' },  // Empty - double word separator
  { filename: 'space-only-TSP.svg', code: 'TSP' },  // Single TSP (invisible glyph)
  { filename: 'space-only-QSP.svg', code: 'QSP' },  // Single QSP (invisible glyph)
  { filename: 'space-only-TSP_TSP.svg', code: 'TSP/TSP' },  // Two TSP glyphs
  { filename: 'space-only-QSP_QSP.svg', code: 'QSP/QSP' },  // Two QSP glyphs
  { filename: 'space-only-TSP__TSP.svg', code: 'TSP//TSP' },  // TSP in separate words

  //Leading/trailing space glyphs (should produce same output as single H)
  { filename: 'leading-space__H.svg', code: '//H' },  // Leading space - same as H
  { filename: 'trailing-space-H__.svg', code: 'H//' },  // Trailing space - same as H
  { filename: 'both-spaces__H__.svg', code: '//H//' },  // Both leading and trailing
  { filename: 'multiple-leading___H.svg', code: '///H' },  // Multiple leading spaces
  { filename: 'multiple-trailing-H___.svg', code: 'H///' },  // Multiple trailing spaces
];

/**
 * R13–R16 curated corpus (plan 2026-06-24 / 2026-06-25). Grounded in the
 * R13/R14/R15/R16 + parser-fixes / strip-semantic / kerning efforts and reviewed
 * case-by-case by the user (Phase 3 task 9). 146 cases (38 hand-built + 108 mined,
 * after the decision-11 cross-set dedup of the 4 `_VR_*`/`_XN9` duplicates of the
 * group-6 NB/NBC framing). Custom defs are registered in the e2e `beforeAll`;
 * glyph/indicator kinds carry their FULL shape (the kind drives both the render path
 * and the […]/{…} filename wrapper).
 *
 * `same: true` is documentation only: the case is verified to render identically to
 * a sibling today, but per decision 10 it still keeps its OWN reference, so a future
 * divergence is caught by its own snapshot — the flag is NOT a reference share.
 */
export const curatedDefs = {
  SC1: { codeString: 'B1103' },
  CDH: { codeString: 'B1103/B431^' },
  FA: { codeString: 'B313^' },
  FB: { codeString: 'B1103^' },
  WCD: { codeString: 'B1103/B431' },
  SEMB: { codeString: 'B313;B97' },
  CMPB: { codeString: 'B313;B98' },
  ADJB: { codeString: 'B313;B86' },
  _XN9: { codeString: 'B291;B97' },
  MYADJ: { codeString: 'B428;B86' },
  EXTRA: { codeString: 'B291' },
  FLEXBOX: { codeString: 'B313' },
  MAXVAL: { codeString: 'B303' },
  _VR_INNER: { codeString: 'B313//B431^' },
  _VR_OUTER: { codeString: 'B208/_VR_INNER' },
  NB: { codeString: 'B291;B97' },
  NBC: { codeString: 'B291' },
  MG: { type: 'glyph', codeString: 'B291;B143' },
  MGb: { type: 'glyph', codeString: 'B291' },
  MI: { type: 'glyph', isIndicator: true, codeString: 'B86;SDOT:3,4', anchorOffsetX: -0.5, width: 3 },
};

// { code, file?, same? } — filename is DERIVED below via codeToFilename; `file` is
// present ONLY for option cases (codeToFilename returns null) and carries the
// curated alias-expanded opt- name. `same: true` is documentation (see header).
const curatedCaseSpecs = [
  // hand-built groups 1–4 — atypical/composite base, baseless stacks, leading-semicolon, char ; vs word ;;
  { code: 'C8:0,8;B233:0,-3;B84' },
  { code: 'B233:0,-3;C8:0,8;B84', same: true },
  { code: 'B101;B8;B99' },
  { code: 'B8;B101;B99' },
  { code: 'B97;B99' },
  { code: 'B86;B97' },
  { code: 'B81;B99' },
  { code: ';B86' },
  { code: ';;B86', same: true },
  { code: ';B97' },
  { code: ';B81' },
  { code: 'B233;B86' },
  { code: 'B233;;B86', same: true },
  { code: 'B291;;B86', same: true },
  // hand-built group 5 — R16 dot options
  { code: '[dot-width=0.5]||DOT', file: 'opt-dot-width-0.5.svg' },
  { code: '[sdot-width=0.7]||SDOT', file: 'opt-sdot-width-0.7.svg' },
  { code: '[sdot-extra-width=0.8]||SDOT', file: 'opt-sdot-extra-width-0.8.svg' },
  { code: '[dot-extra-width=1]||DOT', file: 'opt-dot-extra-width-1-DOT.svg' },
  { code: '[dot-extra-width=1]||SDOT', file: 'opt-dot-extra-width-1-SDOT.svg' },
  // hand-built group 6 — custom alias: additive / strip-semantic / promotion / burial
  { code: 'NB' },
  { code: 'NB;B81' },
  { code: 'NB;!B81', same: true },
  { code: 'NB;;!B81', same: true },
  { code: 'NBC;B81', same: true },
  { code: '[error-placeholder]||H;NB', file: 'opt-error-placeholder-H+(B291+B97).svg' },
  // hand-built group 7 — custom glyph […] and indicator {…}
  { code: 'MG' },
  { code: 'MG;B81' },
  { code: 'MG;;B81', same: true },
  { code: 'MG/B313' },
  { code: 'H;MG' },
  { code: 'MGb' },
  { code: 'MI' },
  { code: 'B291;MI' },
  { code: 'B428;MI' },
  { code: 'B291;MI:3,0' },
  { code: 'B291;B97;MI' },
  { code: 'MG;MI' },
  { code: ';MI', same: true },
  // R13 — head markers (^) with word-level ;;
  { code: 'B313/B1103;;B97' },
  { code: 'B313/B1103^;;B97' },
  { code: 'B313^/B1103;;B97', same: true },
  { code: 'B313/B1103/B431;;B97' },
  { code: 'B313/B1103^/B431;;B97' },
  { code: 'B313/B1103/B431^;;B97' },
  { code: 'B313/SC1^;;B97', same: true },
  { code: 'CDH;;B97' },
  { code: 'B1103/B431^;;B97', same: true },
  { code: 'B313/CDH;;B97', same: true },
  { code: 'FA/FB;;B97', same: true },
  { code: 'B313/WCD^;;B97', same: true },
  { code: 'B313^/B1103^;;B97', same: true },
  { code: 'B313/B1103/B431^/B1103^;;B97' },
  // R16 — dot sizing (options)
  { code: '[dot-extra-width=1]||COMMA', file: 'opt-dot-extra-width-1-COMMA.svg' },
  { code: '[dot-width=1.5]||COMMA', file: 'opt-dot-width-1.5-COMMA.svg', same: true },
  { code: '[dot-width=0.4]||COMMA', file: 'opt-dot-width-0.4-COMMA.svg' },
  { code: '[dot-extra-width=0.6;dot-width=0.4]||COMMA', file: 'opt-dot-extra-0.6-dot-width-0.4-COMMA.svg', same: true },
  { code: '[dot-width=1.5]||DOT', file: 'opt-dot-width-1.5-DOT.svg' },
  { code: '[dot-width=5]||DOT', file: 'opt-dot-width-5-DOT.svg', same: true },
  { code: '[sdot-width=1.5]||SDOT', file: 'opt-sdot-width-1.5-SDOT.svg' },
  { code: '[sdot-width=5]||SDOT', file: 'opt-sdot-width-5-SDOT.svg', same: true },
  { code: '[dot-extra-width=1;dot-width=0.4]||DOT', file: 'opt-dot-extra-1-dot-width-0.4-DOT.svg', same: true },
  { code: '[dot-width=0.4]||DOT', file: 'opt-dot-width-0.4-DOT.svg' },
  { code: '[sdot-width=0.6665]||SDOT', file: 'opt-sdot-width-0.6665-SDOT.svg', same: true },
  { code: '[dot-extra-width=0.6]||SDOT', file: 'opt-dot-extra-width-0.6-SDOT.svg' },
  { code: '[sdot-extra-width=0.3]||SDOT', file: 'opt-sdot-extra-width-0.3-SDOT.svg', same: true },
  { code: '[dot-width=0]||DOT', file: 'opt-dot-width-0-DOT.svg' },
  { code: '[sdot-width=0.7]||B291;B83', file: 'opt-sdot-width-0.7-B291+B83.svg' },
  { code: '[sdot-width=0.7]||B291;B907', file: 'opt-sdot-width-0.7-B291+B907.svg' },
  { code: '[sdot-width=0.7]||B291;B912', file: 'opt-sdot-width-0.7-B291+B912.svg' },
  // strip-semantic (;! / ;;!)
  { code: 'SEMB;!B81' },
  { code: 'SEMB;;!B81', same: true },
  { code: 'CMPB;!B81' },
  { code: 'CMPB;;!B81', same: true },
  { code: 'B313;B81' },
  { code: 'B313;!B81', same: true },
  { code: 'B313;;!B81', same: true },
  { code: 'SEMB;!B97' },
  { code: 'ADJB;!B81' },
  // kerning (RK / AK decimals + malformed)
  { code: 'B291/RK:.5/B291' },
  { code: 'B291/RK:0.5/B291', same: true },
  { code: 'B291/RK:-.5/B291' },
  { code: 'B291/RK:-0.5/B291', same: true },
  { code: 'B291/RK:5./B291' },
  { code: 'B291/AK:1.5/B291' },
  { code: 'B291/RK/B291', same: true },
  { code: 'B291/RK:./B291' },
  // R14 — word-level ;; overlay
  { code: 'B313/B1103;;B81' },
  { code: 'B313;B81/B1103', same: true },
  { code: 'B313/B1103;;!B97' },
  { code: 'B313;B97/B1103', same: true },
  { code: 'B313/B1103/B431;;B81' },
  { code: 'B313;B81/B1103/B431', same: true },
  { code: 'B313/B1103^;;B81' },
  { code: 'B313/B1103;B81', same: true },
  { code: '_XN9;;B81' },
  { code: 'B291;B81;B97', same: true },
  { code: 'B303;B97;;!B86' },
  { code: 'B303;B86', same: true },
  { code: 'B303;B97;;B81' },
  { code: 'B303;B81;B97', same: true },
  { code: 'B313;;B81' },
  { code: 'B291;;B99' },
  { code: 'B313;;B81/B431' },
  { code: 'B313;B81/B431' },
  { code: 'B313;;B84;;B97' },
  { code: 'B313;;B81/B431;;B86' },
  { code: '[error-placeholder]||B313;;B81/B431', file: 'opt-error-placeholder-B313++B81_B431.svg' },
  // R15 — atypical base / baseless / promotion
  { code: 'B143;B291;B86' },
  { code: 'B291;B143;B86', same: true },
  { code: 'B1103;B291;B86' },
  { code: 'B291;B1103;B86', same: true },
  { code: 'B138;B291;B86' },
  { code: 'B291;B138;B86', same: true },
  { code: 'B109;B291;B86' },
  { code: 'B291;B109;B86' },
  { code: 'C8:0,8;B233:0,-3;B98' },
  { code: 'B233:0,-3;C8:0,8;B98', same: true },
  { code: 'B291;B97;B99', same: true },
  { code: 'B291;B98:5,0' },
  { code: 'B84:4,0' },
  { code: 'B81;B86' },
  { code: 'B86;B81' },
  { code: 'B87;B92' },
  { code: 'B86;B87;B92' },
  { code: ';B98', same: true },
  { code: 'MYADJ;B97' },
  { code: 'B428;;B97', same: true },
  { code: 'H;MYADJ' },
  { code: '[error-placeholder]||H;MYADJ', file: 'opt-error-placeholder-H+(B428+B86).svg' },
  // parser fixes (X-codes, word-break, delta)
  { code: 'EXTRA', same: true },
  { code: 'FLEXBOX', same: true },
  { code: 'B81/MAXVAL', same: true },
  { code: 'B81/B303' },
  { code: 'Xab', same: true },
  { code: 'Xa/Xb' },
  { code: 'Xhello', same: true },
  { code: 'Xh/Xe/Xl/Xl/Xo' },
  { code: 'Xab/B291', same: true },
  { code: 'Xa/Xb/B291' },
  { code: 'Xhαllo' },
  { code: '_VR_OUTER', same: true },
  { code: 'B208/B313//B431^' },
  { code: '_VR_OUTER;B81' },
  { code: 'B208;B81/B313//B431^' },
  { code: 'B291;B97;;B81' },
  { code: '[error-placeholder]||_VR_OUTER;B81', file: 'opt-error-placeholder-(B208_B313__B431^)+B81.svg' },
];

// filename DERIVED from code + curatedDefs so it is byte-identical to the
// regeneration engine's computation; option cases keep their curated `file`.
export const curatedTests = curatedCaseSpecs.map(spec => ({
  filename: codeToFilename(spec.code, curatedDefs) ?? spec.file,
  code: spec.code,
}));