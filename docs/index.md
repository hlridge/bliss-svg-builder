---
layout: home

hero:
  name: Bliss SVG Builder
  text: Generate SVG for Blissymbolics
  tagline: Compose and render Blissymbolics using a compact DSL
  actions:
    - theme: brand
      text: Get Started
      link: /get-started/installation-setup
    - theme: alt
      text: View on GitHub
      link: https://github.com/hlridge/bliss-svg-builder

features:
  - title: DSL-Powered
    details: Use a simple domain-specific language to describe Bliss characters and compositions
  - title: Dynamic Rendering
    details: Generate SVG output at runtime - no pre-built assets needed
  - title: Highly Customizable
    details: Control colors, sizes, spacing, grids and more with flexible options
  - title: Multi-Format
    details: Supports ES modules, CommonJS, and UMD for maximum compatibility
---

## Quick Example

Render Bliss compositions using B-codes for Bliss characters from [Blissary's Bliss dictionary](https://blissary.com/blissdictionary):

<Demo code="B313" title="B313 - feeling, emotion" />

<Demo code="B1103" title="B1103 - understanding" />

Combine characters into words with `/`:

<Demo code="B313/B1103" title="feeling + understanding = empathy" />

And words into sentences with `//`:

<Demo code="B513/B10//B313;B81/B319//B278;B81//B278/B462//B4" title="I want to listen to music." />

Style with options:

<Demo code="[color=#2563eb]||B431" title="Styled character" />

## What is Blissymbolics?

**Blissymbolics (or Bliss)** is an ideographic language in which meaning is expressed through the composition of Bliss characters, each of which carries its own conceptual meaning. It is widely used as an augmentative and alternative communication (AAC) system.

Bliss-SVG-Builder makes it easy to work with the graphical representation of Bliss programmatically, supporting recursive composition of graphical elements and Bliss characters into complete Bliss sentences using SVG.

<div style="text-align: center; margin: 3rem 0;">
  <a href="./get-started/installation-setup" class="vp-button brand medium">Get Started</a>
</div>