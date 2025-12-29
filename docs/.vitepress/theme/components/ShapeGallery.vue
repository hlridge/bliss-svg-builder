<template>
  <div class="shape-gallery">
    <div v-if="category" class="gallery-description">
      {{ category.description }}
    </div>

    <div v-if="category?.note" class="gallery-note">
      {{ category.note }}
    </div>

    <div v-if="error" class="gallery-error">
      <strong>Error:</strong> {{ error }}
    </div>

    <div v-else class="gallery-grid">
      <div v-for="code in category?.codes || []" :key="code" class="shape-item">
        <div class="shape-svg" v-html="svgs[code]"></div>
        <div class="shape-code">{{ code }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  category: {
    type: String,
    required: true
  }
});

const categoryName = ref(props.category);
const category = ref(null);
const svgs = ref({});
const error = ref('');

const formatCategoryName = (name) => {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
};

onMounted(async () => {
  try {
    const shapes = await import('../../../examples/shapes.js');

    // In development, import from source for hot reload
    // In production (GitHub Pages), import from built package
    const { BlissSVGBuilder } = import.meta.env.DEV
      ? await import('../../../../src/index.js')
      : await import('bliss-svg-builder');

    category.value = shapes[props.category];

    if (!category.value) {
      error.value = `Category "${props.category}" not found`;
      return;
    }

    for (const code of category.value.codes) {
      try {
        let renderCode = code;

        // For diagonal lines outside/inside circle, add the circle shape
        if (code.startsWith('DLOC') || code.startsWith('DLIC')) {
          // Extract diameter (8 or 4) from code like DLOC8NW or DLIC4N
          const diameterMatch = code.match(/^DL[OI]C(\d+)/);
          if (diameterMatch) {
            const diameter = diameterMatch[1];
            renderCode = `${code};[stroke-width=0.125;color=red;stroke-dasharray=0.5,1]>C${diameter}`;
          }
        }

        const builder = new BlissSVGBuilder(`[freestyle=1;grid=1;grid-sky-color=#c7c7c7]||${renderCode}`);
        svgs.value[code] = builder.svgCode;
      } catch (e) {
        svgs.value[code] = `<div class="svg-error">Error: ${e.message}</div>`;
      }
    }
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.shape-gallery {
  margin: var(--bliss-gap-4) 0;
}

.gallery-description {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  font-family: var(--vp-font-family-mono);
  margin-bottom: var(--bliss-gap-2);
  padding: 0.85rem 1rem;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 35%, var(--vp-c-bg));
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--bliss-border));
  border-radius: var(--bliss-radius-md);
  box-shadow: var(--bliss-shadow-sm);
}

.gallery-note {
  margin-bottom: var(--bliss-gap-3);
  padding: 0.85rem 1rem;
  border-radius: var(--bliss-radius-md);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--bliss-border));
  background: color-mix(in srgb, var(--vp-c-bg-soft) 35%, var(--vp-c-bg));

  position: relative;
  overflow: hidden;
  font-weight: 650;
}
.gallery-note::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--bliss-gradient);
}

.gallery-error {
  color: var(--vp-c-danger-1);
  padding: 1rem;
  background: var(--vp-c-danger-soft);
  border-radius: var(--bliss-radius-md);
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 25%, transparent);
  margin: 1rem 0;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.9rem;
}

.shape-item {
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--bliss-border));
  border-radius: var(--bliss-radius-md);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 65%, var(--vp-c-bg));
  box-shadow: var(--bliss-shadow-sm);

  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.6rem;
  padding: 0.9rem;

  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.shape-svg {
  min-height: 86px;
  max-height: 86px;

  display: grid;
  place-items: center;

  border-radius: var(--bliss-radius-sm);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--bliss-border));

  /* Always light background for Bliss SVG contrast in both themes */
  background: #f8f9fb;
}

.shape-svg :deep(svg) {
  max-width: 100%;
  max-height: 86px;
  height: auto;
}

.shape-code {
  justify-self: center;

  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  line-height: 1.1;
  color: var(--vp-c-text-2);

  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--bliss-border));
  background: color-mix(in srgb, var(--vp-c-bg-soft) 15%, var(--vp-c-bg));
  padding: 0.3rem 0.55rem;
  border-radius: 999px;

  text-align: center;
  word-break: break-word;
}

.svg-error {
  color: var(--vp-c-danger-1);
  font-size: 0.75rem;
  text-align: center;
  padding: 0.5rem;
}
</style>
