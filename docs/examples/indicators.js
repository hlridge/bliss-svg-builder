// Indicator data for documentation

export const indicators = {
  // Nominal Indicators
  B99: { name: "INDICATOR PLURAL", purpose: "Marks plural" },
  B5996: { name: "INDICATOR DEFINITE PLURAL", purpose: "Definite + plural combined" },
  B904: { name: "INDICATOR DEFINITE", purpose: "Marks definiteness" },
  B97: { name: "INDICATOR THING", purpose: "Marks concrete sense" },
  B98: { name: "INDICATOR PLURAL THING", purpose: "Marks plural concrete sense" },
  B5998: { name: "INDICATOR DEFINITE PLURAL THING", purpose: "Definite + plural + thing combined" },
  B5997: { name: "INDICATOR DEFINITE THING", purpose: "Definite + thing combined" },
  B908: { name: "INDICATOR INDEFINITE", purpose: "Marks indefiniteness" },
  TBD_ABSTRACT: { name: "INDICATOR ABSTRACT", purpose: "Marks abstract sense", isTbd: true },

  // Verbal Indicators
  B81: { name: "INDICATOR ACTION", purpose: "Marks as action (verb)" },
  B82: { name: "INDICATOR ACTIVE", purpose: "Marks active voice" },
  B92: { name: "INDICATOR PAST", purpose: "Marks past tense" },
  B928: { name: "INDICATOR PRESENT", purpose: "Marks present tense" },
  B87: { name: "INDICATOR FUTURE", purpose: "Marks future tense" },
  B903: { name: "INDICATOR CONTINUOUS", purpose: "Marks continuous aspect" },
  B907: { name: "INDICATOR IMPERATIVE", purpose: "Marks imperative mood (commands)" },
  B93: { name: "INDICATOR PAST CONDITIONAL", purpose: "Marks past conditional" },
  B83: { name: "INDICATOR PRESENT CONDITIONAL", purpose: "Marks present conditional" },
  B88: { name: "INDICATOR FUTURE CONDITIONAL", purpose: "Marks future conditional" },
  B95: { name: "INDICATOR PAST PASSIVE", purpose: "Marks past passive voice" },
  B91: { name: "INDICATOR PASSIVE", purpose: "Marks passive voice" },
  B89: { name: "INDICATOR FUTURE PASSIVE", purpose: "Marks future passive voice" },
  B94: { name: "INDICATOR PAST PASSIVE CONDITIONAL", purpose: "Marks past passive conditional" },
  B96: { name: "INDICATOR PRESENT PASSIVE CONDITIONAL", purpose: "Marks present passive conditional" },
  B90: { name: "INDICATOR FUTURE PASSIVE CONDITIONAL", purpose: "Marks future passive conditional" },

  // Adjectival Indicators
  B85: { name: "INDICATOR DESCRIPTION BEFORE THE FACT", purpose: "Marks as description (potential/ability)" },
  B86: { name: "INDICATOR DESCRIPTION", purpose: "Marks as description (adjective/adverb)" },
  B84: { name: "INDICATOR DESCRIPTION AFTER THE FACT", purpose: "Marks as description (completed action)" },
  B911: { name: "INDICATOR PAST PARTICIPLE", purpose: "Marks past participle form" },
  B914: { name: "INDICATOR PRESENT PARTICIPLE", purpose: "Marks present participle form" },
  B912: { name: "INDICATOR PAST PERFECTIVE PARTICIPLE", purpose: "Marks past perfective participle form" },
  B902: { name: "INDICATOR DESCRIPTION OF ACTION", purpose: "Marks as description of action (adverb)" },

  // Other Indicators (not in Unicode proposal)
  B910: { name: "INDICATOR DIRECT OBJECT", purpose: "Marks direct object role" },
  TBD_INDIRECT_OBJECT: { name: "INDICATOR INDIRECT OBJECT", purpose: "Marks indirect object role", isTbd: true },
  B905: { name: "INDICATOR FEMININE", purpose: "Marks feminine gender" },
  B909: { name: "INDICATOR NEUTER", purpose: "Marks neuter gender" },
  B906: { name: "INDICATOR FIRST PERSON", purpose: "Marks first person" },
  B915: { name: "INDICATOR SECOND PERSON", purpose: "Marks second person" },
  B916: { name: "INDICATOR THIRD PERSON", purpose: "Marks third person" },
  B913: { name: "INDICATOR POSSESSIVE", purpose: "Marks possessive" },
  B992: { name: "INDICATOR DIMINUTIVE", purpose: "Marks diminutive meaning" }
};

// Indicator groups with display order
export const indicatorGroups = [
  {
    name: "Nominal Indicators",
    codes: ['B99', 'B5996', 'B904', 'B97', 'B98', 'B5998', 'B5997']
  },
  {
    name: "Verbal Indicators",
    codes: ['B81', 'B82', 'B92', 'B928', 'B87', 'B903', 'B907', 'B93', 'B83', 'B88', 'B95', 'B91', 'B89', 'B94', 'B96', 'B90']
  },
  {
    name: "Adjectival Indicators",
    codes: ['B85', 'B86', 'B84', 'B911', 'B914', 'B912', 'B902']
  },
  {
    name: "Indicators Not Planned for Unicode",
    codes: ['B908', 'TBD_ABSTRACT', 'B910', 'TBD_INDIRECT_OBJECT', 'B905', 'B909', 'B906', 'B915', 'B916', 'B913', 'B992']
  }
];
