<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="[
      'form-button',
      { 'form-button--disabled': disabled },
    ]"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
interface Props {
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  ariaLabel?: string
}

interface Emits {
  click: [event: MouseEvent]
}

withDefaults(defineProps<Props>(), {
  type: 'button',
})

const emit = defineEmits<Emits>()

const onClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<style scoped>
.form-button {
}

.form-button:hover:not(:disabled) {
}

.form-button--disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}
</style>
