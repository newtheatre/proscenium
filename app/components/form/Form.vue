<template>
  <form
    novalidate
    @submit="onSubmit"
  >
    <!-- Display form error if present -->
    <div
      v-if="props.error"
    >
      <p class="form-error">
        {{ props.error }}
      </p>
    </div>

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

<style scoped>
.form-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
  margin-bottom: 1rem;
}
</style>
