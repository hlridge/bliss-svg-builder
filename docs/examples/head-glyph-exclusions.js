// Head glyph exclusion data for documentation

export const exclusions = {
  // Structural markers
  B233: { name: 'combine marker', why: 'Technical, not semantic' },

  // Pragmatic lexical markers
  B401: { name: 'exclamatory', why: 'Pragmatic marker, not core meaning' },
  B699: { name: 'interrogative', why: 'Pragmatic marker, not core meaning' },

  // Scalar degree operators
  B937: { name: 'more (comparative)', why: 'Modifies degree, not meaning' },
  B968: { name: 'most (superlative)', why: 'Modifies degree, not meaning' },
  B6438: { name: 'less (comparative)', why: 'Modifies degree, not meaning' },
  B6321: { name: 'least (superlative)', why: 'Modifies degree, not meaning' },

  // Identity-affecting operators
  'B449/B401': { name: 'not', why: 'Negates the concept' },
  B486: { name: 'opposite', why: 'Inverts the concept' },

  // Concept-transforming operators
  'B1060/B578/B303': { name: 'looks similar to', why: 'Compares concepts' },
  'B1060/B578/B608': { name: 'sounds similar to', why: 'Compares concepts' },
  'B1060/B578/B374': { name: 'feels similar to', why: 'Compares concepts' },
  'B1060/B578/B473': { name: 'smells similar to', why: 'Compares concepts' },
  'B1060/B578/B642': { name: 'tastes similar to', why: 'Compares concepts' },
  'B1060/B578': { name: 'similar to', why: 'Compares concepts' },
  'B578/B303': { name: 'looks like', why: 'Compares concepts' },
  'B578/B608': { name: 'sounds like', why: 'Compares concepts' },
  'B578/B374': { name: 'feels like', why: 'Compares concepts' },
  'B578/B473': { name: 'smells like', why: 'Compares concepts' },
  'B578/B642': { name: 'tastes like', why: 'Compares concepts' },
  B348: { name: 'generalization of', why: 'Abstracts the concept' },

  // Relational operators
  B449: { name: 'without', why: 'Relates concepts' },
  B578: { name: 'same as', why: 'Relates concepts' },
  'B502/B167': { name: 'part of Blissymbol', why: 'Relates concepts' },
  B502: { name: 'part of', why: 'Relates concepts' },
  B102: { name: 'about', why: 'Relates concepts' },
  B104: { name: 'across', why: 'Relates concepts' },
  B109: { name: 'after', why: 'Relates concepts' },
  B111: { name: 'against', why: 'Relates concepts' },
  'B120/B120': { name: 'along with', why: 'Relates concepts' },
  'B162/B368': { name: 'among', why: 'Relates concepts' },
  B134: { name: 'around', why: 'Relates concepts' },
  B135: { name: 'at', why: 'Relates concepts' },
  B158: { name: 'before', why: 'Relates concepts' },
  B162: { name: 'between', why: 'Relates concepts' },
  B195: { name: 'by', why: 'Relates concepts' },
  B482: { name: 'on', why: 'Relates concepts' },
  B491: { name: 'out of (forward)', why: 'Relates concepts' },
  B492: { name: 'out of (downward)', why: 'Relates concepts' },
  B977: { name: 'out of (upward)', why: 'Relates concepts' },
  B976: { name: 'out of (backward)', why: 'Relates concepts' },
  B402: { name: 'into (forward)', why: 'Relates concepts' },
  B1124: { name: 'into (downward)', why: 'Relates concepts' },
  B1125: { name: 'into (upward)', why: 'Relates concepts' },
  B1123: { name: 'into (backward)', why: 'Relates concepts' },
  B490: { name: 'outside', why: 'Relates concepts' },
  B398: { name: 'inside', why: 'Relates concepts' },
  B493: { name: 'over, above', why: 'Relates concepts' },
  B676: { name: 'under, below', why: 'Relates concepts' },
  B1102: { name: 'under (ground level)', why: 'Relates concepts' },
  B331: { name: 'instead of', why: 'Relates concepts' },
  B332: { name: 'for the purpose of', why: 'Relates concepts' },
  B337: { name: 'from', why: 'Relates concepts' },
  B657: { name: 'to, toward', why: 'Relates concepts' },
  B653: { name: 'through', why: 'Relates concepts' },
  B677: { name: 'until', why: 'Relates concepts' },
  B160: { name: 'belongs to', why: 'Relates concepts' },

  // Determiners
  B100: { name: 'a, an (indefinite)', why: 'Specifies definiteness' },
  B647: { name: 'the (definite)', why: 'Specifies definiteness' },

  // Quantifiers
  'B368/B368/B368': { name: 'many/much x3', why: 'Quantity modifier' },
  'B368/B368': { name: 'many/much x2', why: 'Quantity modifier' },
  B368: { name: 'many/much', why: 'Quantity modifier' },
  B117: { name: 'all', why: 'Quantity modifier' },
  'B11/B117': { name: 'both', why: 'Quantity modifier' },
  'B10/B117': { name: 'each, every', why: 'Quantity modifier' },
  B286: { name: 'either', why: 'Quantity modifier' },
  'B449/B286': { name: 'neither', why: 'Quantity modifier' },
  B951: { name: 'half', why: 'Quantity modifier' },
  B962: { name: 'quarter', why: 'Quantity modifier' },
  B1151: { name: 'one third', why: 'Quantity modifier' },
  B1152: { name: 'two thirds', why: 'Quantity modifier' },
  B1153: { name: 'three quarters', why: 'Quantity modifier' },
  'B559/B11': { name: 'several', why: 'Quantity modifier' },
  B9: { name: 'zero', why: 'Quantity modifier' },
  B10: { name: 'one', why: 'Quantity modifier' },
  B11: { name: 'two', why: 'Quantity modifier' },
  B12: { name: 'three', why: 'Quantity modifier' },
  B13: { name: 'four', why: 'Quantity modifier' },
  B14: { name: 'five', why: 'Quantity modifier' },
  B15: { name: 'six', why: 'Quantity modifier' },
  B16: { name: 'seven', why: 'Quantity modifier' },
  B17: { name: 'eight', why: 'Quantity modifier' },
  B18: { name: 'nine', why: 'Quantity modifier' },
};

// Exclusion groups with display order
export const exclusionGroups = [
  {
    name: 'Structural Markers',
    description: 'Technical, never head',
    codes: ['B233']
  },
  {
    name: 'Pragmatic Lexical Markers',
    description: 'Low-priority exclusions',
    codes: ['B401', 'B699']
  },
  {
    name: 'Scalar Degree Operators',
    codes: ['B937', 'B968', 'B6438', 'B6321']
  },
  {
    name: 'Identity-Affecting Operators',
    codes: ['B449/B401', 'B486']
  },
  {
    name: 'Concept-Transforming Operators',
    codes: [
      'B1060/B578/B303', 'B1060/B578/B608', 'B1060/B578/B374',
      'B1060/B578/B473', 'B1060/B578/B642', 'B1060/B578',
      'B578/B303', 'B578/B608', 'B578/B374', 'B578/B473',
      'B578/B642', 'B348'
    ]
  },
  {
    name: 'Relational Operators',
    codes: [
      'B449', 'B578', 'B502/B167', 'B502', 'B102', 'B104', 'B109',
      'B111', 'B120/B120', 'B162/B368', 'B134', 'B135', 'B158',
      'B162', 'B195', 'B482', 'B491', 'B492', 'B977', 'B976',
      'B402', 'B1124', 'B1125', 'B1123', 'B490', 'B398', 'B493',
      'B676', 'B1102', 'B331', 'B332', 'B337', 'B657', 'B653',
      'B677', 'B160'
    ]
  },
  {
    name: 'Determiners',
    codes: ['B100', 'B647']
  },
  {
    name: 'Quantifiers',
    codes: [
      'B368/B368/B368', 'B368/B368', 'B368', 'B117',
      'B11/B117', 'B10/B117', 'B286', 'B449/B286',
      'B951', 'B962', 'B1151', 'B1152', 'B1153', 'B559/B11',
      'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18'
    ]
  }
];
