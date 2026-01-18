# Words & Sentences

Combine characters into words and sentences using separators.

## Word Composition

Use `/` to combine characters into a word:

```js
const builder = new BlissSVGBuilder('B206/B746');
```

<Demo code="B206/B746" title="cause + mystery = magic" />

## Attaching Indicators within Words

Use `;` to attach an indicator to a specific character within a word:

<Demo code="B206;B86/B746" title="magical (character-level indicator attachment)" />

Use `;;` to attach an indicator to the head (main) character of a word:

<Demo code="B206/B746;;B86" title="magical (word-level indicator attachment)" />

<Demo code="B486/B378;;B86" title="opposite + hot = cold (indicator auto-attached to the second character)" />

The `;;` syntax automatically finds the grammatical head and places the indicator there.

## Sentence Composition

Use `//` to separate words:

```js
const builder = new BlissSVGBuilder('B513/B10//B431;B81//B414/B167');
```

<Demo code="B513/B10//B431;B81//B414/B167" title="I love Blissymbolics" />

## Complete Sentence

<Demo code="B513/B10//B313;B81/B319//B278;B81//B278/B462//B4" title="I want to listen to music." />
