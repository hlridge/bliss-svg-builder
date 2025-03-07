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

  static #setupEscapeMaps() {
    // Escaping map for special characters in text section
    // Using characters from the Unicode Private Use Area (U+F000 to U+F005) to avoid conflicts with normal characters.
    const escapeMap = {
      "\\": "\uF000",
      ";": "\uF001",
      "{": "\uF002",
      "}": "\uF003",
      "n": "\uF004",
      "r": "\uF005",
    };

    // Unescaping map
    const unescapeMap = {};
    for (let k in escapeMap) {
      unescapeMap[escapeMap[k]] = k;
    }

    return { escapeMap, unescapeMap };
  }

  static #parseOptions(optionsString) {
    if (!optionsString) return;

    // ...[OPTIONSKEY1=OPTIONSVALUE1;OPTIONSKEY2=OPTIONSVALUE2]...
    const extractedContent = optionsString.match(/\[([^\]]*)\]/)?.[1].replace(/\s/g, '');
    const keyValuePairs = extractedContent ? extractedContent.split(';') : [];
    const parsedObject = {};

    for (const keyValuePair of keyValuePairs) {
      const [key, value] = keyValuePair.split('=');
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

    let [_, optionsString, codeString] = str.match(/^(\[[^\}]*\])?(.*)/);

    if (optionsString) {
      part.options = this.#parseOptions(optionsString);
    }

    if (codeString) {
      const matched = codeString.match(/^([\w\-.]+):?(\-?\d*(?:\.\d*)?)?,?(\-?\d*(?:\.\d*)?)?$/);

      if (matched) {
        let [, code, x, y] = matched;
        part.code = code;
        part.x = Number(x) || 0;
        part.y = Number(y) || 0;
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
    let result = { options: {}, words: [] };

    // Parse a Blissymbolics string and convert it to an internal representation (BlissComposition)
    //Ex. 
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4{hej}/C8:0,8;[color=green]E:0,11{hopp}/AA8N:0,2"
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4/C8:0,8;[color=green]E:0,11/AA8N:0,2{hej hopp}"

    let { escapeMap, unescapeMap } = this.#setupEscapeMaps();

    // Replace special characters inside square brackets with their escaped versions
    
    let placeholderMap = {};
    let placeholderCount = 0;

    inputString = inputString.replace(/\{(.*?)\}/g, (match, group1) => {
      let placeholder = `PLACEHOLDER_${placeholderCount++}`;
      placeholderMap[placeholder] = group1.trim();
      return `{${placeholder}}`;
    });

    // Remove all spaces in input string
    inputString = inputString.replace(/\s/g, '');

    // Temorarily handle uses of kerning code K
    inputString = inputString.replace(/(.*?)\/K(:-\d+)(\/[^\/]*)/g, '$1$3$2')

    // Extract global options
    let [_, globalOptionsString, globalCodeString] = inputString.match(/^\s*(?:([^|]*)\s*\|\|)?(.*)$/);
    result.options = this.#parseOptions(globalOptionsString);

    // Iterate over each word part in the remaining string
    let threePartWordStrings = globalCodeString.split('//');

    for (let tpws of threePartWordStrings) {
      if (tpws === "") continue;
      let word = { options: {}, characters: [] };

      let [_, twoPartWordString, textKey] = tpws.match(/(.*?)(?:\{(.*?(?<!\\))\})?$/);

      // Escape characters in text
      if (textKey) {
        word.text = placeholderMap[textKey];
        //character.text = text.replace(/\\(.)/g, (_, char) => unescapeMap[escapeMap[char]] ? unescapeMap[escapeMap[char]] : char);
      }
      
      function replaceWithDefinition(str, definitions) {
        let parts = str.split('/');
        let resultParts = [];  // Accumulate resulting parts here
    
        for (let part of parts) {
            if (definitions[part]?.codeString) {
                resultParts.push(...definitions[part].codeString.split('/'));
            } else {
                resultParts.push(part);
            }
        }
    
        let newStr = resultParts.join('/');
    
        // If string has changed, recursively process it, otherwise return it
        if (newStr !== str) {
            return replaceWithDefinition(newStr, definitions);
        } else {
            return newStr;
        }
      }
    
      let twoPartCharacterStrings = replaceWithDefinition(twoPartWordString, blissElementDefinitions).split('/');
    
      for (let tpcs of twoPartCharacterStrings) {
        if (tpcs === "") continue;
        const character = { parts: [] };

        // Extract text
        //let [_, twoPartCharacterString, textKey] = tpcs.match(/(.*?)(?:\{(.*?(?<!\\))\})?$/); //TODO: adjust this to not include {text}

        const [characterOptionsString, characterCodeString] = tpcs.includes('|') ? tpcs.split("|", 2) : [undefined, tpcs];

        if (characterOptionsString) {
          character.options = this.#parseOptions(characterOptionsString);
        }

        const parseParts = (partsString) => {
          const parts = [];
          const twoPartPartStrings = partsString.split(';');
          for (const twoPartPartString of twoPartPartStrings) {
            const part = this.parsePartString(twoPartPartString);

            const definition = blissElementDefinitions[part.code];
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
              part.top = definition.top;
            }

            part.center = definition.center;

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
