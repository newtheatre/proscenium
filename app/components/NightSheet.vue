<script setup lang="ts">
// A show-night overlay (issue 1317, docs/design-language.md rule 11): a sheet from the foot of the
// phone, titled and nothing more, the primary full width with Back beneath it.
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  title: string
  primary?: string
  primaryColor?: 'primary' | 'secondary' | 'error'
  primaryDisabled?: boolean
  loading?: boolean
  // Where a screen already names its own controls, so its tests and pictures keep finding them.
  testId?: string
  primaryTestId?: string
}>()

const emit = defineEmits<{ primary: [] }>()

// The first choice, never the corner cross the desk modal opens on; a sheet with no choice
// opens on its first field instead.
function focusFirst(event: Event): void {
  const within = event.target instanceof HTMLElement ? event.target : null
  const first = within?.querySelector<HTMLElement>('[data-sheet-first]')
    ?? within?.querySelector<HTMLElement>('input, textarea, select, button')
  if (!first) return
  event.preventDefault()
  first.focus()
}

const content = { onOpenAutoFocus: focusFirst }
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="props.title"
    :content="content"
    :ui="{ title: 'text-lg font-semibold', body: 'space-y-4', footer: 'flex flex-col gap-2' }"
  >
    <template #body>
      <div
        class="space-y-4"
        :data-test="testId"
      >
        <slot />
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="primary"
        block
        size="xl"
        :color="primaryColor ?? 'primary'"
        class="min-h-12 justify-center font-semibold"
        :loading="loading"
        :disabled="primaryDisabled"
        :data-test="primaryTestId"
        @click="emit('primary')"
      >
        {{ primary }}
      </UButton>
      <UButton
        block
        color="neutral"
        variant="ghost"
        size="xl"
        class="min-h-12 justify-center"
        @click="open = false"
      >
        {{ CONFIRM_BACK_LABEL }}
      </UButton>
    </template>
  </UDrawer>
</template>
