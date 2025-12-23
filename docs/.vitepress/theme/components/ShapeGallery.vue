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
  margin: 1.5rem 0;
}

.gallery-description {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  font-family: var(--vp-font-family-mono);
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
}

.gallery-note {
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-mute);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 4px;
  font-weight: 600;
}

.gallery-error {
  color: var(--vp-c-danger-1);
  padding: 1rem;
  background: var(--vp-c-danger-soft);
  border-radius: 4px;
  margin: 1rem 0;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1rem;
}

.shape-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  transition: all 0.2s ease;
}

.shape-item:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.shape-svg {
  width: 100%;
  min-height: 81px;
  max-height: 81px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.shape-svg :deep(svg) {
  max-width: 100%;
  max-height: 81px;
  height: auto;
}

.shape-code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-align: center;
  word-break: break-all;
}

.svg-error {
  color: var(--vp-c-danger-1);
  font-size: 0.75rem;
  text-align: center;
}
</style>
