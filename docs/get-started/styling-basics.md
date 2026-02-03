# Styling Basics

Control the appearance of your Bliss SVG with options.

## Colors & Spacing

Customize colors, line thickness, and spacing between characters and words.

<Demo code="[color=red]||B313" title="A red heart (=feeling)" />

<Demo code="[color=#FFFFFF;background=#000000]||B1161/B470" title="White on black background" />

<Demo code="[stroke-width=1;char-space=3;word-space=12]||B513/B10//B431;B81//B414/B167//B4" title="A bold text example" />

## Grid Options

Bliss characters are often arranged on a grid for consistent spacing and alignment.

<Demo code="[grid=1]||B206;B81/RK:-2/B516/B894;B97/B956" title="A Bliss word on a default grid" />

And sometimes on colored background to indicate part of speech.

<Demo code="[grid=1;background=rgb(251, 202, 196);grid-sky-color=red;grid-earth-color=red;grid-major-color=rgb(196, 158, 153);grid-medium-color=rgb(231, 186, 180);grid-minor-color=rgb(231, 186, 180)]||B206;B81/RK:-2/B516/B894;B97/B956" title="A Bliss word on a colored grid" />

## Advanced Styling

Style at any level - the entire composition, individual words, characters, or even shapes within characters. Use options, SVG attributes, or CSS.

<Demo code="B513/B10/AK:-8/[color=red;stroke-width=0.3]HL8:0,18//[style='filter: drop-shadow(0 0 0.5px rgba(255, 0, 0, 1)) drop-shadow(0 0 1px rgba(255, 0, 0, .75))']B431;[color=black;stroke-width=1]>B81/AK:-9/[color=lightgreen;stroke-width=0.75]>B81//[stroke-width=1;color=black]|ZSA/AK:8/B414/B167/AK:-16/[stroke-width=0.5;color=orange][stroke-dasharray=0 0.80]>B414/[stroke-width=0.5;color=orange]B167//B4" title="Style elements at any level" />

Ready to dive deeper? Head to the [Handbook](/handbook/writing/characters-bcodes) for comprehensive guides on all features.
