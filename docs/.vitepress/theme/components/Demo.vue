<template>
  <div class="bliss-demo bliss-card bliss-card--accent">
    <div v-if="title" class="demo-title">{{ title }}</div>

    <div class="demo-output">
      <div v-if="error" class="demo-error">
        <strong>Error:</strong> {{ error }}
      </div>
      <div v-else-if="svg" class="demo-svg" v-html="svg"></div>
    </div>

    <div class="demo-code">
      <div class="code-label">Input:</div>
      <code>{{ code }}</code>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  code: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  annotations: {
    type: String,
    default: ''
  }
});

const svg = ref('');
const error = ref('');

function addAnnotationsToSVG(svgCode, annotationsJson) {
  if (!annotationsJson) return svgCode;

  try {
    const annotations = JSON.parse(annotationsJson);

    // Parse the SVG to inject text elements
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgCode, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    // Add each annotation as a text element
    annotations.forEach(annotation => {
      const text = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'text');

      // Use x and y directly as SVG coordinates
      text.setAttribute('x', annotation.x);
      text.setAttribute('y', annotation.y);

      // Default text styling
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-size', '2');
      text.setAttribute('fill', '#666');
      text.setAttribute('stroke', 'none');

      // Apply custom styles if provided
      if (annotation.style) {
        Object.entries(annotation.style).forEach(([key, value]) => {
          // Convert camelCase to kebab-case for SVG attributes
          const svgAttr = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          text.setAttribute(svgAttr, value);
        });
      }

      text.textContent = annotation.text;
      svgElement.appendChild(text);
    });

    // Serialize back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgDoc);
  } catch (e) {
    console.error('Error adding annotations:', e);
    return svgCode; // Return original SVG if annotation fails
  }
}

onMounted(async () => {
  try {
    const { BlissSVGBuilder } = await import('bliss-svg-builder');
    const builder = new BlissSVGBuilder(props.code);
    let svgCode = builder.svgCode;

    // Add annotations if provided
    if (props.annotations) {
      svgCode = addAnnotationsToSVG(svgCode, props.annotations);
    }

    svg.value = svgCode;
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.bliss-demo {
  margin: var(--bliss-gap-4) 0;
  padding: var(--bliss-gap-3);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--bliss-border));
  border-radius: var(--bliss-radius-md);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 65%, var(--vp-c-bg));
  box-shadow: var(--bliss-shadow-sm);
}

.demo-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bliss-gap-2);
  font-weight: 700;
  margin-bottom: var(--bliss-gap-2);
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.demo-output {
  padding: 1.25rem;
  border-radius: var(--bliss-radius-sm);
  border: 1px solid var(--bliss-border);
  margin-bottom: var(--bliss-gap-2);
  min-height: 130px;

  /* "SVG canvas" look - light background in light mode, adapts in dark mode */
  background:
    linear-gradient(0deg, #f8f9fb, #f8f9fb),
    linear-gradient(90deg, rgba(127,127,127,.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(127,127,127,.08) 1px, transparent 1px);
  background-size: auto, 16px 16px, 16px 16px;
  background-position: 0 0, 0 0, 0 0;

  display: flex;
  align-items: center;
  justify-content: center;
}

.demo-svg {
  width: 100%;
  display: grid;
  place-items: center;
  /* Transparent in light mode (inherits .demo-output), light in dark mode */
}

/* Dark mode: override .demo-output background while keeping .demo-svg light */
:deep(.dark) .demo-output,
.dark .demo-output {
  background:
    linear-gradient(0deg, color-mix(in srgb, var(--vp-c-bg) 88%, transparent), color-mix(in srgb, var(--vp-c-bg) 88%, transparent)),
    linear-gradient(90deg, rgba(127,127,127,.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(127,127,127,.08) 1px, transparent 1px);
}

.dark .demo-svg {
  background: #f8f9fb;
  border-radius: 5px;
  box-shadow: inset 0 0 6px 4px rgba(0,0,0,0.65);
}

.demo-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.demo-error {
  width: 100%;
  color: var(--vp-c-danger-1);
  padding: 0.75rem 1rem;
  background: var(--vp-c-danger-soft);
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 25%, transparent);
  border-radius: var(--bliss-radius-sm);
}

.demo-code {
  display: grid;
  gap: 0.35rem;
  font-size: calc(var(--bliss-mono-size) + 0.05rem);
}

.code-label {
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.demo-code code {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;

  /* Lighter bluish background with rose-tinted text */
  background: color-mix(in srgb, var(--vp-c-bg-soft) 15%, var(--vp-c-bg));
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--bliss-border));
  color: var(--vp-code-color);
  padding: 0.7rem 0.85rem;
  border-radius: var(--bliss-radius-sm);
  font-family: var(--vp-font-family-mono);
  font-size: 0.95rem;
  line-height: 1.4;
}
</style>
