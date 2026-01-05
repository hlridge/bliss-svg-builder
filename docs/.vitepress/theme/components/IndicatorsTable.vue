<template>
  <div class="indicators-table">
    <div v-if="error" class="table-error">
      <strong>Error:</strong> {{ error }}
    </div>

    <div v-else>
      <section v-for="group in displayGroups" :key="group.name || 'filtered'" class="indicator-group">
        <h3 v-if="group.name" class="group-heading">
          {{ group.name }}
          <span v-if="group.description" class="group-description">{{ group.description }}</span>
        </h3>

        <table class="indicator-table">
          <thead>
            <tr>
              <th class="col-code">Code</th>
              <th class="col-svg">Indicator</th>
              <th class="col-name">Name</th>
              <th class="col-purpose">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in group.codes" :key="code" :class="{ 'tbd-row': isTbd(code) }">
              <td class="col-code">
                <code v-if="!isTbd(code)">{{ code }}</code>
                <span v-else class="tbd-badge">TBD</span>
              </td>
              <td class="col-svg">
                <div v-if="!isTbd(code)" class="indicator-svg" v-html="svgs[code]"></div>
                <div v-else class="indicator-svg tbd">—</div>
              </td>
              <td class="col-name">{{ names[code] || '—' }}</td>
              <td class="col-purpose">{{ purposes[code] || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';

const props = defineProps({
  codes: {
    type: Array,
    default: null
  }
});

const groups = ref([]);
const svgs = ref({});
const names = ref({});
const purposes = ref({});
const error = ref('');

const isTbd = (code) => code.startsWith('TBD_');

const displayGroups = computed(() => {
  if (props.codes) {
    // Filtered mode: show only specified codes in a single ungrouped table
    return [{
      name: null,
      codes: props.codes
    }];
  }
  // Full mode: show all groups
  return groups.value;
});

onMounted(async () => {
  try {
    const indicatorsModule = await import('../../../examples/indicators.js');

    // In development, import from source for hot reload
    // In production (GitHub Pages), import from built package
    const { BlissSVGBuilder } = import.meta.env.DEV
      ? await import('../../../../src/index.js')
      : await import('bliss-svg-builder');

    groups.value = indicatorsModule.indicatorGroups;

    // Get names and purposes from indicators.js
    for (const [code, data] of Object.entries(indicatorsModule.indicators)) {
      names.value[code] = data.name;
      purposes.value[code] = data.purpose;
    }

    // Render SVGs for all non-TBD codes
    for (const group of groups.value) {
      for (const code of group.codes) {
        if (!isTbd(code)) {
          try {
            const builder = new BlissSVGBuilder(`[crop-top=2;crop-bottom=12]||${code}`);
            svgs.value[code] = builder.svgCode;
          } catch (e) {
            svgs.value[code] = `<div class="svg-error">Error</div>`;
          }
        }
      }
    }
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.indicators-table {
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

.indicator-group {
  margin-bottom: 3rem;
}

.indicator-group:last-child {
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

.indicator-table {
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
  width: 80px;
}

.col-svg {
  width: 80px;
}

.col-name {
  width: 280px;
}

.col-purpose {
  color: var(--vp-c-text-2);
}

.indicator-svg {
  width: 60px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fb;
  border-radius: var(--bliss-radius-sm);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--bliss-border));
}

.indicator-svg :deep(svg) {
  max-width: 100%;
  max-height: 36px;
  height: auto;
}

.indicator-svg.tbd {
  color: var(--vp-c-text-3);
  font-style: italic;
}

code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.tbd-row {
  opacity: 0.5;
  font-style: italic;
}

.tbd-badge {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--bliss-border);
  border-radius: var(--bliss-radius-sm);
  color: var(--vp-c-text-3);
}

.svg-error {
  color: var(--vp-c-danger-1);
  font-size: 0.7rem;
}
</style>
