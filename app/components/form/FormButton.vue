<template>
  <UIButton
    :type="type"
    :variant="variant"
    :disabled="disabled"
    :loading="loading"
    :full-width="fullWidth"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <slot />
  </UIButton>
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

withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  fullWidth: true,
})

const emit = defineEmits<Emits>()

const onClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>
