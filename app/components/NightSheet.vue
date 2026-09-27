<script setup lang="ts">
// A show-night overlay (issue 1317, docs/design-language.md rule 11): a sheet from the foot of the
// phone, titled and nothing more, the primary full width with Back beneath it.
const open = defineModel<boolean>('open', { required: true })

defineProps<{
  title: string
  primary?: string
  primaryColor?: 'primary' | 'secondary' | 'error'
  primaryDisabled?: boolean
  loading?: boolean
  // Where a screen already names its own controls, so its tests and pictures keep finding them.
  primaryTestId?: string
}>()

const emit = defineEmits<{ primary: [] }>()

// The first choice, never the corner cross the desk modal opens on; else the body's first field,
// and with neither, Back, so Enter never fires the primary unasked (a reset, an approval).
function focusFirst(event: Event): void {
  const within = event.target instanceof HTMLElement ? event.target : null
  const first = within?.querySelector<HTMLElement>('[data-sheet-first]')
    ?? within?.querySelector<HTMLElement>('[data-slot="body"] :is(input, textarea, select, button)')
    ?? within?.querySelector<HTMLElement>('[data-sheet-back]')
  if (!first) return
  event.preventDefault()
  first.focus()
}

const content = { onOpenAutoFocus: focusFirst }
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="title"
    :content="content"
    :ui="{ title: 'text-lg font-semibold', body: 'space-y-4', footer: 'flex flex-col gap-2' }"
  >
    <template #body>
      <slot />
    </template>

    <template #footer>
      <UButton
        v-if="primary"
        block
        size="xl"
        :color="primaryColor ?? 'primary'"
        class="min-h-12"
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
        class="min-h-12"
        data-sheet-back
        @click="open = false"
      >
        {{ CONFIRM_BACK_LABEL }}
      </UButton>
    </template>
  </UDrawer>
</template>
