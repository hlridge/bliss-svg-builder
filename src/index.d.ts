/**
 * BlissSVGBuilder class for creating and managing SVG content.
 */
declare class BlissSVGBuilder {
  /**
   * Creates an instance of BlissSVGBuilder.
   * @param input The input data for initializing the SVG.
   */
  constructor(input: any);

  /**
   * Returns the main path element of the SVG as a string.
   */
  readonly svgPath: string;

  /**
   * Returns the SVG as a DOM Element.
   */
  readonly svgElement: HTMLElement;

  /**
   * Returns the SVG code as a string, without the XML declaration.
   */
  readonly svgCode: string;

  /**
   * Returns the SVG code as a string, including the XML declaration.
   */
  readonly standaloneSvg: string;

  /**
   * Converts the SVG to a string representation.
   * @returns A string representation of the SVG.
   */
  toString(): string;

  /**
   * Converts the SVG to its JSON representation.
   * @returns The JSON representation of the SVG.
   */
  toJSON(): any;

  /**
   * Extends the library with custom data.
   * @param data The custom data as a key-value pair object.
   */
  static extendData(data: Record<string, any>): void;
}

// If your library is a CommonJS module
declare module 'bliss-svg-builder' {
  export = BlissSVGBuilder;
}

// If your library is an ES6 module
export = { BlissSVGBuilder };
