<template>
  <div class="expandable-section">
    <button
      type="button"
      class="expandable-section__toggle"
      :aria-expanded="isExpanded"
      :aria-controls="sectionId"
      @click="toggle"
    >
      <span class="expandable-section__title">
        {{ title }}
      </span>
      <span
        class="expandable-section__icon"
        :class="{ 'expandable-section__icon--expanded': isExpanded }"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </span>
    </button>

    <div
      :id="sectionId"
      class="expandable-section__content"
      :class="{ 'expandable-section__content--expanded': isExpanded }"
    >
      <div class="expandable-section__inner">
        <p
          v-if="description"
          class="expandable-section__description"
        >
          {{ description }}
        </p>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  description?: string
  defaultExpanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  defaultExpanded: false,
})

const isExpanded = ref(props.defaultExpanded)
const sectionId = useId()

const toggle = () => {
  isExpanded.value = !isExpanded.value
}

// Expose toggle method for parent components
defineExpose({
  toggle,
  isExpanded: readonly(isExpanded),
})
</script>

<style scoped>
.expandable-section {
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--header-bg-color);
  overflow: hidden;
  transition: all var(--transition-fast);
}

.expandable-section__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: transparent;
  border: none;
  color: var(--primary-text-color);
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.expandable-section__toggle:hover {
  background: var(--border-color-light);
}

.expandable-section__toggle:focus {
  outline: none;
  box-shadow: inset var(--focus-ring-orange);
}

.expandable-section__title {
  text-align: left;
}

.expandable-section__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary-text-color);
  transition: transform var(--transition-fast);
}

.expandable-section__icon--expanded {
  transform: rotate(180deg);
}

.expandable-section__content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.expandable-section__content--expanded {
  max-height: 1000px; /* Large enough for content */
  transition: max-height 0.3s ease-in;
}

.expandable-section__inner {
  padding: 0 1.5rem 1.5rem 1.5rem;
}

.expandable-section__description {
  margin: 0 0 1.5rem 0;
  font-size: 0.9rem;
  color: var(--secondary-text-color);
  line-height: 1.5;
}

/* Responsive design */
@media (max-width: 768px) {
  .expandable-section__toggle {
    padding: 0.75rem 1rem;
    font-size: 1rem;
  }

  .expandable-section__inner {
    padding: 0 1rem 1rem 1rem;
  }
}
</style>
