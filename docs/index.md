---
layout: home

hero:
  name: Bliss SVG Builder
  text: SVG Toolkit for Blissymbolics
  tagline: Compose, inspect, and manipulate Blissymbolics with a full-featured API
  actions:
    - theme: brand
      text: Get Started
      link: /get-started/installation-setup
    - theme: alt
      text: View on GitHub
      link: https://github.com/hlridge/bliss-svg-builder

features:
  - title: DSL Composition
    details: Describe characters, words, and sentences using a compact domain-specific language with inline options
  - title: Programmatic Mutation
    details: Modify elements after creation by setting options, replacing parts, or restructuring the tree
  - title: Element Inspection
    details: Traverse the element tree, take snapshots, and read computed dimensions at any level
  - title: Definition Management
    details: Register custom glyphs and shapes, extend the built-in dictionary, or override existing definitions
  - title: Flexible Styling
    details: Control colors, sizes, spacing, margins, cropping, and grid overlays through a rich multi-level options system
  - title: Multi-Format Output
    details: Ships as ESM, CommonJS, and a browser IIFE, and renders to SVG strings or live DOM elements
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

Bliss SVG Builder makes it easy to work with the graphical representation of Bliss programmatically, supporting recursive composition of graphical elements and Bliss characters into complete Bliss sentences, with tools for inspecting, modifying, and rendering the result as SVG.

<div style="text-align: center; margin: 3rem 0;">
  <a href="./get-started/installation-setup" class="vp-button brand medium">Get Started</a>
</div>