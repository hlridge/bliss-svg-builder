# Characters & B-Codes

Each Bliss character is identified by a unique **B-code** (like B313, B431, B1103) from [Blissary's Bliss dictionary](https://blissary.com/blissdictionary). These codes let you reference any character in the library.

## Using B-Codes

Pass a B-code to generate a character:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('B313');
const svg = builder.svgCode;
```

<Demo code="B313" title="B313 - feeling, emotion" />

## More Examples

<Demo code="B431" title="B431 - love, affection" />

<Demo code="B1103" title="B1103 - understanding, comprehension" />

<Demo code="B513" title="B513 - person" />

## Indicators

In Bliss, indicators are diacritic markers that go above the base character.

<IndicatorsTable :codes="['B81', 'B86', 'B97', 'B99']" />

See the [Indicators Reference](/reference/indicators-reference) for the complete list.

## Attaching Indicators

Use `;` to attach an indicator to a character:

<Demo code="B431;B81" title="B431;B81 - to love (love + action indicator)" />

The indicator is automatically positioned above the base character.

