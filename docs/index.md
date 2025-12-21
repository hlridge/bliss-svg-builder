---
layout: home

hero:
  name: Bliss SVG Builder
  text: Generate SVG for Blissymbolics
  tagline: Uses a powerful DSL to build Bliss characters, words, and sentences
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

<Demo code="H" title="Heart symbol" />

<Demo code="C8" title="Circle (diameter 8)" />

<Demo code="[color=red]||H" title="Colored heart" />

## What is Blissymbolics?

Blissymbolics (or Bliss) is a semantic language using visual characters to represent concepts. It's widely used as an augmentative and alternative communication (AAC) system. This library makes it easy to work with the graphical representation of Bliss programmatically - from individual shapes to complete compositions.
