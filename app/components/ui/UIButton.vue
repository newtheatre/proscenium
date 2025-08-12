<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :class="[
      'button',
      `button--${variant}`,
      { 'button--loading': loading },
    ]"
    @click="onClick"
  >
    <div
      v-if="loading"
      class="button__spinner"
    >
      <LoadingSpinner />
    </div>
    <div
      :class="[
        'button__content',
        { 'button__content--hidden': loading },
      ]"
    >
      <slot />
    </div>
  </button>
</template>

<script setup lang="ts">
interface Props {
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'ghost' | 'outlined'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  ariaLabel?: string
}

interface Emits {
  click: [event: MouseEvent]
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  fullWidth: false,
})

const emit = defineEmits<Emits>()

const onClick = (event: MouseEvent) => {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
.button {
  display: flex;
  padding: var(--spacing-sm) 0.75rem;
  justify-content: center;
  align-items: center;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 1em;
  position: relative;
  width: v-bind('fullWidth ? "100%" : "fit-content"');
  transition: background-color var(--transition-fast), filter var(--transition-fast);
}

.button--primary {
  background-color: var(--nnt-purple);
  color: white;
}

.button--secondary {
  background-color: var(--nnt-orange);
  color: var(--alt-text-color);
}

.button--ghost {
  background-color: transparent;
  color: var(--primary-text-color);
  border: 1px solid var(--nnt-purple);
}

.button--outlined {
  background-color: transparent;
  color: var(--nnt-purple);
  border: 1px solid var(--nnt-purple);
}

.button:hover,
.button:active,
.button:focus {
  filter: brightness(1.2);
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button:disabled:hover {
  opacity: 0.5;
  filter: none;
}

.button--loading {
  cursor: wait;
}

.button__spinner {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.button__content--hidden {
  visibility: hidden;
}
</style>
