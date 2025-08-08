<template>
  <form
    novalidate
    @submit="onSubmit"
  >
    <AppAlert
      v-if="props.error"
      type="error"
    >
      {{ props.error }}
    </AppAlert>

    <slot />
  </form>
</template>

<script setup lang="ts">
interface Props {
  error?: string
}

interface Emits {
  submit: [event: Event]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const onSubmit = (event: Event) => {
  event.preventDefault()
  emit('submit', event)
}
</script>
