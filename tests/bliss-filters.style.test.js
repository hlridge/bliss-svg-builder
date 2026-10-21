import { describe, it, expect } from 'vitest';
import { rewriteStyle, splitDeclarations } from '../src/lib/bliss-filters.js';

/**
 * Pins how the filter module reads a `style` value: the one splitter both the
 * filter translation and an element background's copy of its effects use, and
 * the rewrite that points each translatable `filter` declaration at its
 * native filter in place.
 *
 * Covers:
 * - Splitting at each `;` outside parentheses, quotes, escapes and comments,
 *   a declaration's property read in any case with its spacing and comments
 *   removed (none where it has no colon), and every declaration kept as
 *   written, so the parts join back into the style.
 * - Rewriting: each `filter` declaration that translates becomes
 *   `filter:url(#id)` under the property as written, `!important` kept,
 *   allocated in order; a declaration that does not translate, and every
 *   other declaration, left byte for byte.
 *
 * Does NOT cover:
 * - Which filter values translate, see `bliss-filters.reader.test.js`.
 * - Which declarations an element background's copy takes, see
 *   `BlissSVGBuilder.background-effects.test.js`.
 * - CSS escapes (a backslash) inside a `style`, which are not read. The text
 *   read is the escaped text the markup carries (`&quot;`, `&#39;`).
 *
 * @issue: #34
 */

// The style rewritten with ids f1, f2, ... and what each allocation was given.
const rewrite = (style) => {
  const reads = [];
  const out = rewriteStyle(style, (read) => {
    reads.push(read);
    return `f${reads.length}`;
  });
  return { out, reads };
};
const BLUR_1 = '<feGaussianBlur stdDeviation="1"/>';

describe('bliss-filters style', () => {
  describe('when a style is split into declarations', () => {
    it.each([
      ['several declarations', 'transform:scale(2);color:red;opacity:0.5',
        [['transform', 'transform:scale(2)'], ['color', 'color:red'], ['opacity', 'opacity:0.5']]],
      ['a ; inside parentheses', 'mask:url(data:image/png;base64,AAAA);color:red',
        [['mask', 'mask:url(data:image/png;base64,AAAA)'], ['color', 'color:red']]],
      ['a property in capitals, spaced', 'color:red; OPACITY :0.5',
        [['color', 'color:red'], ['opacity', ' OPACITY :0.5']]],
      ['a parenthesis inside quotes', 'font-family:&#39;a(b&#39;;opacity:0.5',
        [['font-family', 'font-family:&#39;a(b&#39;'], ['opacity', 'opacity:0.5']]],
      ['a ; inside quotes', 'content:&quot;a;b&quot;;opacity:0.5',
        [['content', 'content:&quot;a;b&quot;'], ['opacity', 'opacity:0.5']]],
      ['an unmatched closing parenthesis', 'color:red);opacity:0.5',
        [['color', 'color:red)'], ['opacity', 'opacity:0.5']]],
      ['a ; inside a comment', 'color:red/*;opacity:0*/;opacity:0.5',
        [['color', 'color:red/*;opacity:0*/'], ['opacity', 'opacity:0.5']]],
      ['a parenthesis inside a comment', 'color:red/*(*/;opacity:0.5',
        [['color', 'color:red/*(*/'], ['opacity', 'opacity:0.5']]],
      ['a comment before a property', '/*x*/opacity:0.5',
        [['opacity', '/*x*/opacity:0.5']]],
      ['a comment holding a colon before a property', '/*a:b*/opacity:0.5',
        [['opacity', '/*a:b*/opacity:0.5']]],
      ['a comment between a property and its colon', 'filter/*c*/:blur(1px)',
        [['filter', 'filter/*c*/:blur(1px)']]],
      ['a quote inside a comment', '/*&#39;*/opacity:0.5;color:red',
        [['opacity', '/*&#39;*/opacity:0.5'], ['color', 'color:red']]],
      ['a comment opener inside quotes', 'content:&#39;/*&#39;;opacity:0.5',
        [['content', 'content:&#39;/*&#39;'], ['opacity', 'opacity:0.5']]],
      ['an empty declaration', 'color:red;;opacity:0.5',
        [['color', 'color:red'], ['', ''], ['opacity', 'opacity:0.5']]],
      ['a declaration without a colon', 'filter;color:red',
        [['', 'filter'], ['color', 'color:red']]],
      ['an escape outside quotes', 'font-family:a&amp;b;opacity:0.5',
        [['font-family', 'font-family:a&amp;b'], ['opacity', 'opacity:0.5']]],
    ])('splits a style with %s', (_case, style, expected) => {
      // pins the comment skip and the case-blind property read (hand mutants
      // of the module, C9 Task 2)
      const declarations = splitDeclarations(style);

      expect(declarations).toEqual(expected.map(([property, text]) => ({ property, text })));
      expect(declarations.map(declaration => declaration.text).join(';')).toBe(style);
    });
  });

  describe('when a style holds a filter declaration that translates', () => {
    it.each([
      ['filter:blur(1px)', 'filter:url(#f1)'],
      ['color:red;filter:blur(1px);opacity:0.5', 'color:red;filter:url(#f1);opacity:0.5'],
      ['FILTER:BLUR(1PX)', 'FILTER:url(#f1)'],
      ['filter :/*c*/blur(1px)', 'filter :url(#f1)'],
      ['filter/*c*/:blur(1px)', 'filter/*c*/:url(#f1)'],
      ['filter: blur(1px)', 'filter:url(#f1)'],
      ['filter:blur(1px)!important', 'filter:url(#f1)!important'],
      ['filter:blur(1px) ! IMPORTANT', 'filter:url(#f1)!important'],
      ['filter:blur(1px);filter:grayscale(1)', 'filter:url(#f1);filter:url(#f2)'],
      ['filter:blur(1em);filter:blur(1px)', 'filter:blur(1em);filter:url(#f1)'],
      ['mask:url(data:image/png;base64,AAAA);filter:blur(1px)', 'mask:url(data:image/png;base64,AAAA);filter:url(#f1)'],
      [';filter:blur(1px);;', ';filter:url(#f1);;'],
    ])('rewrites %s as %s', (style, rewritten) => {
      // pins !important kept on the rewritten declaration: without it a host
      // rule that loses to the written filter today would start to win
      expect(rewrite(style).out).toBe(rewritten);
    });

    it('hands each translated declaration to the allocation in order, with what it reads', () => {
      const { reads } = rewrite('filter:blur(1px);color:red;filter:drop-shadow(1px 1px 0 red) !important');

      expect(reads).toEqual([
        { kind: 'translated', primitives: [BLUR_1], reach: 3 },
        { kind: 'translated', primitives: ['<feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="red"/>'], reach: 1 },
      ]);
    });
  });

  describe('when a style holds no filter declaration that translates', () => {
    it.each([
      ['an untranslatable value', 'filter:blur(1em)'],
      ['no effect to draw', 'filter:none'],
      ['a reference to a definition', 'filter:url(#a)'],
      ['no filter at all', 'color:red'],
      ['a filter only inside a comment', '/*filter:blur(1px)*/color:red'],
      ['a filter only inside quotes', 'content:&#39;filter:blur(1px)&#39;'],
      ['a longer property name', 'filter-x:blur(1px);xfilter:blur(1px)'],
      ['a property split by a comment', 'fil/**/ter:blur(1px)'],
      ['a property led by a no-break space, which CSS does not read as spacing', ' filter:blur(1px)'],
      ['no colon', 'filter'],
    ])('leaves a style with %s as written and allocates nothing', (_case, style) => {
      const { out, reads } = rewrite(style);

      expect(out).toBe(style);
      expect(reads).toEqual([]);
    });
  });
});
