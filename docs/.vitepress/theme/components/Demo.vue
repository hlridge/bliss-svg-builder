<template>
  <div class="bliss-demo">
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
  }
});

const svg = ref('');
const error = ref('');

onMounted(async () => {
  try {
    const { BlissSVGBuilder } = await import('bliss-svg-builder');
    const builder = new BlissSVGBuilder(props.code);
    svg.value = builder.svgCode;
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.bliss-demo {
  margin: 1.5rem 0;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.demo-title {
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--vp-c-text-1);
}

.demo-output {
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  margin-bottom: 0.75rem;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.demo-svg {
  display: flex;
  align-items: center;
  justify-content: center;
}

.demo-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.demo-error {
  color: var(--vp-c-danger-1);
  padding: 1rem;
  background: var(--vp-c-danger-soft);
  border-radius: 4px;
}

.demo-code {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.875rem;
}

.code-label {
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.demo-code code {
  background: var(--vp-c-bg-mute);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
}
</style>
