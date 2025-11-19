/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";

export class BlissParser {
  static parse(codeStr, options) {
      const result = this.fromString(codeStr);

      if (options) {
        result.options = {...result.options, ...options};
      }

      return result;
  }


  static #parseOptions(optionsString) {
    if (!optionsString) return;

    const extractedContent = optionsString.match(/\[([^\]]*)\]/)?.[1];
    if (!extractedContent) return;

    const parsedObject = {};

    const regex = /([\w-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,]+)/g;
    let match;

    while ((match = regex.exec(extractedContent)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim();

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }

      parsedObject[key] = value;
    }

    return parsedObject;
  }

    // Helper function to encode string and parse global options
  static encodeString(inputString, unescapeMap) {
    // ... existing encoding and global option parsing code here ...
    return { encodedString, globalOptions };
  }

  static parsePartString(str) {
    const part = {};

    let optionsString, codeString;
    const match = str.match(/^(\[.*?\])>(.*)$/);
    if (match) {
      optionsString = match[1];
      codeString = match[2];
      part.options = this.#parseOptions(optionsString);
    } else {
      codeString = str;
    }

    if (codeString) {
      const matched = codeString.match(/^([\w\-.]+):?(\-?\d*(?:\.\d*)?)?,?(\-?\d*(?:\.\d*)?)?$/);

      if (matched) {
        let [, code, x, y] = matched;
        part.code = code;
        x !== undefined && (part.x = Number(x));
        y !== undefined && (part.y = Number(y));
      } else {
        part.error = `Invalid format: ${codeString}`;
      }
    }

    return part;
  }
  // Helper function to parse character parts
  static parseCharacterParts(encodedString, escapeMap, unescapeMap) {
    let parts = [];
    // ... existing character parts parsing code here ...
    return parts;
  }

  static fromString(inputString) {
    inputString = inputString.trim();
    let result = { words: [] };

    // Parse a Blissymbolics string and convert it to an internal representation (BlissComposition)
    //Ex. 
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4{hej}/C8:0,8;[color=green]E:0,11{hopp}/AA8N:0,2"
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4/C8:0,8;[color=green]E:0,11/AA8N:0,2{hej hopp}"

    let placeholderMap = {};
    let placeholderCount = 0;

    // Preserve content in both {...} and [...] to protect spaces
    // {...} uses greedy match since it's always at the end and can contain any characters
    // [...] uses non-greedy match since it can appear multiple times
    inputString = inputString.replace(/\{(.*)\}|\[([^\]]*)\]/g, (match, textContent, optionContent) => {
      let placeholder = `PLACEHOLDER_${placeholderCount++}`;
      if (textContent !== undefined) {
        placeholderMap[placeholder] = { content: textContent, openBracket: '{', closeBracket: '}' };
        return '{' + placeholder + '}';
      } else {
        placeholderMap[placeholder] = { content: optionContent, openBracket: '[', closeBracket: ']' };
        return '[' + placeholder + ']';
      }
    });

    // Remove all spaces in input string (but not in preserved content)
    inputString = inputString.replace(/\s/g, '');

    // Restore preserved content
    inputString = inputString.replace(/(\{|\[)PLACEHOLDER_(\d+)(\}|\])/g, (match, open, num, close) => {
      const { content, openBracket, closeBracket } = placeholderMap[`PLACEHOLDER_${num}`];
      return openBracket + content + closeBracket;
    });

    // Extract global options
    let [_, globalOptionsString, globalCodeString] = inputString.match(/^\s*(?:([^|]*)\s*\|\|)?(.*)$/);
    result.options = this.#parseOptions(globalOptionsString) || {};

    // Iterate over each word part in the remaining string
    let threePartWordStrings = globalCodeString.split('//');

    for (let tpws of threePartWordStrings) {
      if (tpws === "") continue;

      let word = { characters: [] };

      let [_, twoPartWordString, textKey] = tpws.match(/(.*?)(?:\{(.*?(?<!\\))\})?$/);

      if (textKey) {
        word.text = placeholderMap[textKey]?.content ?? textKey;
      }

      let wordCodeString;
      if (twoPartWordString.includes('|')) {
        const [beforePipe, afterPipe] = twoPartWordString.split("|", 2);
        if (beforePipe.match(/^\[.*\]$/)) {
          word.options = this.#parseOptions(beforePipe);
          wordCodeString = afterPipe;
        } else if (beforePipe.length > 0) {
          console.warn(`Invalid word options syntax: "${beforePipe}|" - expected [options]| format. Ignoring.`);
          wordCodeString = afterPipe;
        } else {
          wordCodeString = afterPipe;
        }
      } else {
        wordCodeString = twoPartWordString;
      }

      function replaceWithDefinition(str, definitions) {
        function expand(str, definitions) {
          const definition = definitions[str] || {};

          // If we have a codeString, recursively expand it
          if (definition.codeString) {
            return definition.codeString.split('/')
              .flatMap(subStr => expand(subStr, definitions))
              .map(expandedSubPart => {
                // Apply properties from the definition, falling back to existing values
                const isIndicator = definition.isIndicator ?? expandedSubPart.isIndicator; //To prevent confusing positioning  logic when a part of an indicator is not directly an indicator
                const isExternalGlyph = expandedSubPart.isExternalGlyph;
                const kerningRules = expandedSubPart.kerningRules;
                const glyph = expandedSubPart.glyph;
                return {
                  part: expandedSubPart.part,
                  ...(isIndicator === true && { isIndicator }),
                  ...(isExternalGlyph === true && { 
                    isExternalGlyph,
                    ...(kerningRules && { kerningRules }),
                    ...(glyph && { glyph })
                  })
                };
              });
          }

          // Base case - create object with properties from definition
          const isIndicator = definition.isIndicator;
          const isExternalGlyph = definition.isExternalGlyph;
          const kerningRules = definition.kerningRules;
          const glyph = definition.glyph;
          return [{
            part: str,
            ...(isIndicator === true && { isIndicator }),
            ...(isExternalGlyph === true && {
              isExternalGlyph,
              ...(kerningRules && { kerningRules }),
              ...(glyph && { glyph })
            })
          }];
        }

        return str.split('/').flatMap(strPart => expand(strPart, definitions));
      }

      const expandedCharacterParts = replaceWithDefinition(wordCodeString, blissElementDefinitions);
  
      let pendingRelativeKerning;
      let pendingAbsoluteKerning;

      for (let { part, isIndicator, isExternalGlyph, glyph, kerningRules } of expandedCharacterParts) {
        if (part === "") continue;

        const character = { 
          parts: [],
          ...(typeof isIndicator === "boolean" && { isIndicator }),
          ...(typeof isExternalGlyph === "boolean" && { isExternalGlyph }),
          ...(typeof glyph === "string" && { glyph }),
          ...((kerningRules !== null && kerningRules?.constructor === Object) && { kerningRules })
        };

        const kerningMatch = part.match(/^(RK|AK)(?::([+-]?\d+(?:\.\d+)?))?$/);
        if (kerningMatch) {
          const [_, kerningType, kerningValue = 0] = kerningMatch;
          if (kerningType === "RK") pendingRelativeKerning = Number(kerningValue);
          if (kerningType === "AK") pendingAbsoluteKerning = Number(kerningValue);
          continue;
        }
  
        if (pendingRelativeKerning) {
          (character.options ??= {}).relativeKerning = pendingRelativeKerning;
          pendingRelativeKerning = undefined;
        }

        if (pendingAbsoluteKerning) {
          (character.options ??= {}).absoluteKerning = pendingAbsoluteKerning;
          pendingAbsoluteKerning = undefined;
        }

        let characterCodeString = part;
        const charMatch = part.match(/^(\[.*?\])(?!>)(.*)/);
        if (charMatch) {
          character.options = this.#parseOptions(charMatch[1]);
          characterCodeString = charMatch[2];
        }

        const parseParts = (partsString) => {
          const parts = [];

          // Split on ; (brackets are already replaced with placeholders at this point)
          const twoPartPartStrings = partsString.split(';');
          for (const twoPartPartString of twoPartPartStrings) {
            const part = this.parsePartString(twoPartPartString);

            const definition = blissElementDefinitions[part.code] || {};
            const codeString = definition.codeString;

            if (codeString) {
              if (codeString.includes(';') || codeString.includes(':') || blissElementDefinitions[codeString].codeString ) {
                part.parts = parseParts(definition.codeString);
                delete part.code;  
              } else {
                part.code = definition.codeString;
              }
            }
            // Else keep part.code

            if (definition.isIndicator) {
              part.isIndicator = true;
              part.width = definition.width ?? 2;
            } else {
              if (definition.anchorOffsetY !== undefined) {
                part.anchorOffsetY = definition.anchorOffsetY;
              }
            }

            if (definition.anchorOffsetX !== undefined) {
              part.anchorOffsetX = definition.anchorOffsetX 
            }
            
            parts.push(part);
          }
          return parts;
        };
        
        character.parts = parseParts(characterCodeString);

        word.characters.push(character);
      }
      result.words.push(word);      
    }

    return result;
  }

  static #fromStream(blissStream) {
    // Parse a Blissymbolics stream and convert it to an internal representation (BlissComposition)
  }

  static #toString(blissComposition) {
    // Convert the internal representation to a Blissymbolics string
  }

  static #toObject(blissComposition) {
    // Convert the internal representation to a Blissymbolics object (JSON)
  }

  static #toStream(blissComposition) {
    // Convert the internal representation to a Blissymbolics stream
  }
}
