<template>
  <div class="exclusions-table">
    <div v-if="error" class="table-error">
      <strong>Error:</strong> {{ error }}
    </div>

    <div v-else>
      <section v-for="group in groups" :key="group.name" class="exclusion-group">
        <h3 class="group-heading">
          {{ group.name }}
          <span v-if="group.description" class="group-description">{{ group.description }}</span>
        </h3>

        <table class="exclusion-table">
          <thead>
            <tr>
              <th class="col-code">Code</th>
              <th class="col-svg">Symbol</th>
              <th class="col-name">Gloss</th>
              <th class="col-why">Why Excluded</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in group.codes" :key="code">
              <td class="col-code"><code>{{ code }}</code></td>
              <td class="col-svg">
                <div class="exclusion-svg" v-html="svgs[code]"></div>
              </td>
              <td class="col-name">{{ names[code] || '—' }}</td>
              <td class="col-why">{{ whys[code] || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const groups = ref([]);
const svgs = ref({});
const names = ref({});
const whys = ref({});
const error = ref('');

onMounted(async () => {
  try {
    const exclusionsModule = await import('../../../examples/head-glyph-exclusions.js');

    const { BlissSVGBuilder } = import.meta.env.DEV
      ? await import('../../../../src/index.js')
      : await import('bliss-svg-builder');

    groups.value = exclusionsModule.exclusionGroups;

    for (const [code, data] of Object.entries(exclusionsModule.exclusions)) {
      names.value[code] = data.name;
      whys.value[code] = data.why;
    }

    // Render SVGs for all codes (single or multi-character)
    for (const group of groups.value) {
      for (const code of group.codes) {
        try {
          const builder = new BlissSVGBuilder(code);
          svgs.value[code] = builder.svgCode;
        } catch (e) {
          svgs.value[code] = `<div class="svg-error">Error</div>`;
        }
      }
    }
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.exclusions-table {
  margin: var(--bliss-gap-4) 0;
}

.table-error {
  color: var(--vp-c-danger-1);
  padding: 1rem;
  background: var(--vp-c-danger-soft);
  border-radius: var(--bliss-radius-md);
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 25%, transparent);
  margin: 1rem 0;
}

.exclusion-group {
  margin-bottom: 3rem;
}

.exclusion-group:last-child {
  margin-bottom: 0;
}

.group-heading {
  margin: 0 0 1rem 0;
  padding: 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  border-bottom: 2px solid var(--bliss-border);
  padding-bottom: 0.5rem;
}

.group-description {
  margin-left: 0.75rem;
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--vp-c-text-3);
}

.exclusion-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  table-layout: fixed;
}

thead {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 65%, var(--vp-c-bg));
  border-bottom: 2px solid var(--bliss-border);
}

th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--bliss-border);
  vertical-align: middle;
}

.col-code {
  width: 140px;
}

.col-svg {
  width: 120px;
}

.col-name {
  width: 200px;
}

.col-why {
  color: var(--vp-c-text-2);
}

.exclusion-svg {
  min-width: 60px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fb;
  border-radius: var(--bliss-radius-sm);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--bliss-border));
}

.exclusion-svg :deep(svg) {
  max-width: 100%;
  max-height: 52px;
  height: auto;
}

code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.svg-error {
  color: var(--vp-c-danger-1);
  font-size: 0.7rem;
}
</style>
