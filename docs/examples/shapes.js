// Shape categories for Bliss SVG Builder documentation
// Each category exports codes array and description

export const special = {
  codes: ["ZSA"],
  description: "[Z]ero-[S]ized [A]nchor (invisible positioning element)"
};

export const iconic = {
  codes: ["H", "E", "F"],
  description: "[H]eart, [E]ar, [F]iber"
};

export const dots = {
  codes: ["DOT", "SDOT", "COMMA"],
  description: "[DOT], [S]mall [DOT], [COMMA]"
};

export const circles = {
  codes: ["C8", "C4", "C2", "C1"],
  description: "[C]ircle with diameter [8/4/2/1]"
};

export const halfCircles = {
  codes: [
    "HC8N", "HC8S", "HC8W", "HC8E",
    "HC4N", "HC4S", "HC4W", "HC4E",
    "HC2N", "HC2S", "HC2W", "HC2E",
    "HC1N", "HC1S", "HC1W", "HC1E",
    "HC.5N", "HC.5S", "HC.5W", "HC.5E"
  ],
  description: "[H]alf [C]ircle with diameter [8/4/2/1/.5] towards [N/S/W/E]"
};

export const quarterCircles = {
  codes: [
    "QC4NW", "QC4NE", "QC4SW", "QC4SE",
    "QC2NW", "QC2NE", "QC2SW", "QC2SE",
    "QC1NW", "QC1NE", "QC1SW", "QC1SE",
    "QC.5NW", "QC.5NE", "QC.5SW", "QC.5SE"
  ],
  description: "[Q]uarter [C]ircle with diameter [4/2/1/.5] towards [NW/NE/SW/SE]"
};

export const openCircles = {
  codes: [
    "OC8NW", "OC8NE", "OC8SW", "OC8SE",
    "OC4NW", "OC4NE", "OC4SW", "OC4SE",
    "OC2NW", "OC2NE", "OC2SW", "OC2SE",
    "OC1NW", "OC1NE", "OC1SW", "OC1SE"
  ],
  description: "[O]pen [C]ircle with diameter [8/4/2/1] and opening towards [NW/NE/SW/SE] (3/4 circle)"
};

export const waves = {
  codes: ["W8N", "W8S", "W8W", "W8E"],
  description: "[W]ave with length [8] towards [N/S/W/E]"
};

export const halfWaves = {
  codes: [
    "HW8N", "HW8S", "HW8W", "HW8E",
    "HW4N", "HW4S", "HW4W", "HW4E",
    "HW2N", "HW2S", "HW2W", "HW2E"
  ],
  description: "[H]alf [W]ave with length [8/4/2] towards [N/S/W/E]"
};

export const horizontalQuarterWaves = {
  codes: [
    "HQW4NW", "HQW4NE", "HQW4SW", "HQW4SE",
    "HQW2NW", "HQW2NE", "HQW2SW", "HQW2SE",
    "HQW1NW", "HQW1NE", "HQW1SW", "HQW1SE"
  ],
  description: "[H]orizontal [Q]uarter [W]ave with width [4/2/1] towards [NW/NE/SW/SE]"
};

export const verticalQuarterWaves = {
  codes: [
    "VQW4NW", "VQW4NE", "VQW4SW", "VQW4SE",
    "VQW2NW", "VQW2NE", "VQW2SW", "VQW2SE",
    "VQW1NW", "VQW1NE", "VQW1SW", "VQW1SE"
  ],
  description: "[V]ertical [Q]uarter [W]ave with height [4/2/1] towards [NW/NE/SW/SE]"
};

export const verticalLines = {
  codes: ["VL12", "VL10", "VL8", "VL6", "VL4", "VL3", "VL2", "VL1.5", "VL1.25", "VL1", "VL.5", "VL.25"],
  description: "[V]ertical [L]ine with length [12/10/8/6/4/3/2/1.5/1.25/1/.5/.25]"
};

export const horizontalLines = {
  codes: ["HL16", "HL15", "HL14", "HL12", "HL10", "HL8", "HL6", "HL4", "HL3", "HL2", "HL1.5", "HL1", "HL.5", "HL.25"],
  description: "[H]orizontal [L]ine with length [16/15/14/12/10/8/6/4/3/2/1.5/1/.5/.25]"
};

export const diagonalLinesAscending = {
  codes: [
    "DL12N", "DL8N", "DL6N", "DL5N", "DL4N", "DL3N", "DL2N", "DL1.5N", "DL1N", "DL.5N",
    "DL2-3N", "DL1-1.5N", "DL3-2N", "DL1.5-1N",
    "DL4-8N", "DL2-4N", "DL1-2N", "DL.5-1N",
    "DL8-4N", "DL4-2N", "DL2-1N", "DL1-.5N",
    "DL1-4N", "DL.5-2N", "DL4-1N", "DL2-.5N"
  ],
  description: "[D]iagonal [L]ine [12/8/6/5/4/3/2/1.5/1/.5] (equal offset) or [2-3/1-1.5/3-2/1.5-1/4-8/2-4/1-2/.5-1/8-4/4-2/2-1/1-.5/1-4/.5-2/4-1/2-.5] (different offset) [N]orth"
};

export const diagonalLinesDescending = {
  codes: [
    "DL12S", "DL8S", "DL6S", "DL5S", "DL4S", "DL3S", "DL2S", "DL1.5S", "DL1S", "DL.5S",
    "DL2-3S", "DL1-1.5S", "DL3-2S", "DL1.5-1S",
    "DL4-8S", "DL2-4S", "DL1-2S", "DL.5-1S",
    "DL8-4S", "DL4-2S", "DL2-1S", "DL1-.5S",
    "DL1-4S", "DL.5-2S", "DL4-1S", "DL2-.5S"
  ],
  description: "[D]iagonal [L]ine [12/8/6/5/4/3/2/1.5/1/.5] (equal offset) or [2-3/1-1.5/3-2/1.5-1/4-8/2-4/1-2/.5-1/8-4/4-2/2-1/1-.5/1-4/.5-2/4-1/2-.5] (different offset) [S]outh"
};

export const diagonalLinesOutsideCircle = {
  codes: [
    "DLOC8NW", "DLOC8NE", "DLOC8SW", "DLOC8SE",
    "DLOC4NW", "DLOC4NE", "DLOC4SW", "DLOC4SE"
  ],
  description: "[D]iagonal [L]ine [O]utside [C]ircle with diameter [8/4] towards [NW/NE/SW/SE] (tangent to circle corner)",
  note: "NOTE: Coordinates given refer to the reference circle (shown in red dashed outline)"
};

export const diagonalLinesInsideCircle = {
  codes: ["DLIC8N", "DLIC8S", "DLIC4N", "DLIC4S"],
  description: "[D]iagonal [L]ine [I]nside [C]ircle with diameter [8/4] ascending [N] or descending [S]",
  note: "NOTE: Coordinates given refer to the reference circle (shown in red dashed outline)"
};

export const rightAngles = {
  codes: [
    "RA8NW", "RA8NE", "RA8SW", "RA8SE",
    "RA4NW", "RA4NE", "RA4SW", "RA4SE",
    "RA3NW", "RA3NE", "RA3SW", "RA3SE",
    "RA2NW", "RA2NE", "RA2SW", "RA2SE",
    "RA1.5NW", "RA1.5NE", "RA1.5SW", "RA1.5SE",
    "RA1NW", "RA1NE", "RA1SW", "RA1SE",
    "RA8N", "RA8S", "RA8W", "RA8E",
    "RA4N", "RA4S", "RA4W", "RA4E",
    "RA3N", "RA3S", "RA3W", "RA3E",
    "RA2N", "RA2S", "RA2W", "RA2E",
    "RA1N", "RA1S", "RA1W", "RA1E"
  ],
  description: "[R]ight [A]ngle with size [8/4/3/2/1.5/1] pointing towards [NW/NE/SW/SE/N/S/W/E]"
};

export const acuteAngles = {
  codes: [
    "AA8N", "AA8S", "AA8W", "AA8E",
    "AA4N", "AA4S", "AA4W", "AA4E",
    "AA2N", "AA2S", "AA2W", "AA2E"
  ],
  description: "[A]cute [A]ngle with size [8/4/2] pointing towards [N/S/W/E]"
};

export const straightCrosses = {
  codes: ["SC8", "SC4", "SC2"],
  description: "[S]traight [C]ross with size [8/4/2] (plus sign shape)"
};

export const diagonalCrosses = {
  codes: ["DC8", "DC4", "DC2"],
  description: "[D]iagonal [C]ross with size [8/4/2] (X shape)"
};

export const rightTriangles = {
  codes: [
    "RT8NW", "RT8NE", "RT8SW", "RT8SE",
    "RT4NW", "RT4NE", "RT4SW", "RT4SE",
    "RT2NW", "RT2NE", "RT2SW", "RT2SE",
    "RT8N", "RT8S", "RT8W", "RT8E",
    "RT4N", "RT4S", "RT4W", "RT4E",
    "RT2N", "RT2S", "RT2W", "RT2E"
  ],
  description: "[R]ight [T]riangle with size [8/4/2] pointing towards [NW/NE/SW/SE/N/S/W/E]"
};

export const acuteTriangles = {
  codes: [
    "AT8N", "AT8S", "AT8W", "AT8E",
    "AT4N", "AT4S", "AT4W", "AT4E",
    "AT2N", "AT2S", "AT2W", "AT2E"
  ],
  description: "[A]cute [T]riangle with size [8/4/2] pointing towards [N/S/W/E]"
};

export const squares = {
  codes: ["S8", "S4", "S2"],
  description: "[S]quare with size [8/4/2]"
};

export const diamondSquares = {
  codes: ["DS8", "DS4", "DS2"],
  description: "[D]iamond [S]quare with size [8/4/2] (rotated 45 degrees)"
};

export const openSquares = {
  codes: [
    "OS8N", "OS8S", "OS8W", "OS8E",
    "OS4N", "OS4S", "OS4W", "OS4E",
    "OS2N", "OS2S", "OS2W", "OS2E"
  ],
  description: "[O]pen [S]quare with size [8/4/2] open towards [N/S/W/E] (three-sided)"
};

export const rectangles = {
  codes: ["R84", "R42", "R48", "R24"],
  description: "[R]ectangle with dimensions [8x4/4x2/4x8/2x4] (width x height)"
};

export const openRectangles = {
  codes: [
    "OR84N", "OR84S", "OR84W", "OR84E",
    "OR42N", "OR42S", "OR42W", "OR42E",
    "OR48N", "OR48S", "OR48W", "OR48E",
    "OR24N", "OR24S", "OR24W", "OR24E"
  ],
  description: "[O]pen [R]ectangle with dimensions [8x4/4x2/4x8/2x4] open towards [N/S/W/E]"
};

export const arrows = {
  codes: [
    "LARR8W", "LARR8E", "LARR8N", "LARR8S",
    "LARR4W", "LARR4E", "LARR4N", "LARR4S",
    "LARR8NW", "LARR8NE", "LARR8SW", "LARR8SE",
    "LARR4NW", "LARR4NE", "LARR4SW", "LARR4SE",
    "ARR8W", "ARR8E", "ARR8N", "ARR8S",
    "ARR4W", "ARR4E", "ARR4N", "ARR4S",
    "ARR8NW", "ARR8NE", "ARR8SW", "ARR8SE",
    "ARR4NW", "ARR4NE", "ARR4SW", "ARR4SE"
  ],
  description: "[L]arge [ARR]ow or [ARR]ow with length [8/4] pointing towards [N/S/W/E/NW/NE/SW/SE]"
};

export const pointers = {
  codes: [
    "P4N", "P4S", "P4W", "P4E",
    "P3N", "P3S", "P3W", "P3E",
    "P2N", "P2S", "P2W", "P2E",
    "P3NW", "P3NE", "P3SW", "P3SE",
    "P2NW", "P2NE", "P2SW", "P2SE",
    "P1.5NW", "P1.5NE", "P1.5SW", "P1.5SE"
  ],
  description: "[P]ointer with size [4/3/2/1.5] pointing towards [N/S/W/E/NW/NE/SW/SE] (arrowhead only)"
};

export const arrowCircle = {
  codes: [
    "LARRC8EC", "LARRC8WC", "LARRC8NC", "LARRC8SC",
    "ARRC8EC", "ARRC8WC", "ARRC8NC", "ARRC8SC",
    "LARRC8ECC", "LARRC8WCC", "LARRC8NCC", "LARRC8SCC",
    "ARRC8ECC", "ARRC8WCC", "ARRC8NCC", "ARRC8SCC"
  ],
  description: "[L]arge [ARR]ow from [C]ircle with diameter [8] exiting [E/W/N/S] [C]lockwise or [CC]ounter-clockwise"
};

export const arrowOpenCircle = {
  codes: [
    "LARROC8SEC", "LARROC8NWC", "LARROC8NEC", "LARROC8SWC",
    "ARROC8SEC", "ARROC8NWC", "ARROC8NEC", "ARROC8SWC",
    "LARROC8SECC", "LARROC8NWCC", "LARROC8NECC", "LARROC8SWCC",
    "ARROC8SECC", "ARROC8NWCC", "ARROC8NECC", "ARROC8SWCC"
  ],
  description: "[L]arge [ARR]ow from [O]pen [C]ircle with diameter [8] and opening [NW/NE/SW/SE] [C]lockwise or [CC]ounter-clockwise"
};

export const arrowHalfCircle = {
  codes: [
    "LARRHC8NC", "LARRHC8SC", "LARRHC8WC", "LARRHC8EC",
    "ARRHC8NC", "ARRHC8SC", "ARRHC8WC", "ARRHC8EC",
    "LARRHC8NCC", "LARRHC8SCC", "LARRHC8WCC", "LARRHC8ECC",
    "ARRHC8NCC", "ARRHC8SCC", "ARRHC8WCC", "ARRHC8ECC"
  ],
  description: "[L]arge [ARR]ow from [H]alf [C]ircle with diameter [8] facing [N/S/W/E] [C]lockwise or [CC]ounter-clockwise"
};

export const arrowQuarterCircle = {
  codes: [
    "LARRQC4NWC", "LARRQC4SWC", "LARRQC4NEC", "LARRQC4SEC",
    "ARRQC4NWC", "ARRQC4SWC", "ARRQC4NEC", "ARRQC4SEC",
    "LARRQC4NWCC", "LARRQC4SWCC", "LARRQC4NECC", "LARRQC4SECC",
    "ARRQC4NWCC", "ARRQC4SWCC", "ARRQC4NECC", "ARRQC4SECC"
  ],
  description: "[L]arge [ARR]ow from [Q]uarter [C]ircle with diameter [4] facing [NW/NE/SW/SE] [C]lockwise or [CC]ounter-clockwise"
};

