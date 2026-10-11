# Head Glyph Exclusions

When a word-level indicator (`;;`) is used, the library determines which character receives the indicator (the head glyph). Characters or character sequences in the following list are skipped from the start of the word, so the indicator lands on the first character that is not skipped. A character from the list that already carries an indicator of its own is not skipped.

The list is a best-effort guess and can change without prior warning. If you use word-level indicators, mark the head with `^` in every word that starts with a character that can act as a modifier. See the [Words & Sentences handbook page](/handbook/writing/words-sentences#the-head-glyph-algorithm) for how the algorithm works and why it can only guess.

<ExclusionsTable />
