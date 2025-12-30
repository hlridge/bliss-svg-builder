---
layout: home

hero:
  name: Bliss SVG Builder
  text: Generate SVG for Blissymbolics
  tagline: Uses a powerful DSL to write Bliss characters, words, and sentences in SVG
  actions:
    - theme: brand
      text: Get Started
      link: /guide/installation
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

Create Bliss characters with simple input strings:

<Demo code="H" title="Heart shape" />

<Demo code="C8" title="Circle (diameter 8)" />

<Demo code="[color=red]||H" title="Colored heart" />

## What is Blissymbolics?

**Blissymbolics (or Bliss)** is an ideographic language in which meaning is expressed through the composition of Bliss characters, each of which carries its own conceptual meaning. It is widely used as an augmentative and alternative communication (AAC) system.

Bliss-SVG-Builder makes it easy to work with the graphical representation of Bliss programmatically, supporting recursive composition of graphical elements and Bliss characters into complete Bliss sentences using SVG.