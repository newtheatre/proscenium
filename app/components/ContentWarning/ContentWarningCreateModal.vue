/**
 * Create Content Warning Modal Component
 *
 * Modal for adding an entry to the shared warning vocabulary (admin/manager only).
 *
 * Features:
 * - Form validation with Zod schema
 * - Slug derived from the title until edited by hand
 * - Technical vs general, which decides whether shows assign it a level
 * - Creates the entry via POST /api/content-warnings
 * - Toast notifications for success/error
 *
 * @emits refresh - Emitted after successful creation
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const emit = defineEmits<{
  refresh: []
}>()

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(80),
  slug: z.string().min(1, 'Slug is required').max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
  kind: z.enum(['TECHNICAL', 'GENERAL']),
  category: z.string().max(60).nullable(),
  description: z.string().max(300).nullable(),
  icon: z.string().max(80).nullable(),
  sort: z.number().int().min(0).max(9999),
})

type Schema = z.output<typeof schema>

const open = ref(false)
const isSubmitting = ref(false)
const toast = useToast()

function blankWarning(): Schema {
  return {
    title: '',
    slug: '',
    kind: 'GENERAL',
    category: null,
    description: null,
    icon: null,
    sort: 0,
  }
}

const state = ref<Schema>(blankWarning())

function resetForm() {
  state.value = blankWarning()
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  try {
    await $fetch('/api/content-warnings', {
      method: 'POST',
      body: {
        ...event.data,
        description: event.data.description || null,
      },
    })

    toast.add({
      title: 'Content warning added',
      description: `${event.data.title} can now be used on shows`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    open.value = false
    resetForm()
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to create content warning'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UButton
    label="Add warning"
    icon="i-lucide-plus"
    @click="() => { open = true }"
  />

  <UModal
    v-model:open="open"
    title="Add content warning"
    description="Add an entry to the shared vocabulary every show picks from."
    @close="resetForm"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <ContentWarningForm v-model="state" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="() => { open = false }"
          />
          <UButton
            type="submit"
            label="Add warning"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
