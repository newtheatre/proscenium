/**
 * Edit an entry in the shared vocabulary. Renaming changes every production
 * carrying it, which is why the count is shown first (ADR-0010).
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminContentWarning } from '~~/shared/types/contentWarnings'

const props = defineProps<{
  contentWarning: AdminContentWarning | null
}>()

const emit = defineEmits<{
  refresh: []
  close: []
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

const open = computed({
  get: () => !!props.contentWarning,
  set: (value) => { if (!value) emit('close') },
})

const isSubmitting = ref(false)
const toast = useToast()

const state = ref<Schema>({
  title: '',
  slug: '',
  kind: 'GENERAL',
  category: null,
  description: null,
  icon: null,
  sort: 0,
})

watch(() => props.contentWarning, (warning) => {
  if (!warning) return
  state.value = {
    title: warning.title,
    slug: warning.slug,
    kind: warning.kind,
    category: warning.category ?? null,
    description: warning.description ?? null,
    icon: warning.icon ?? null,
    sort: warning.sort,
  }
}, { immediate: true })

const inUse = computed(() => props.contentWarning?.showCount ?? 0)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.contentWarning) return
  isSubmitting.value = true
  try {
    await $fetch(`/api/content-warnings/${props.contentWarning.id}`, {
      method: 'PUT',
      body: {
        ...event.data,
        description: event.data.description || null,
      },
    })

    toast.add({
      title: 'Content warning updated',
      description: `${event.data.title} has been saved`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update content warning'),
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
  <UModal
    v-model:open="open"
    title="Edit content warning"
    description="Changes apply everywhere this warning is used."
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UAlert
          v-if="inUse > 0"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :title="`Used by ${inUse} show${inUse === 1 ? '' : 's'}`"
          description="Renaming this changes what those show pages say. The type cannot be changed while it is in use."
        />

        <ContentWarningForm
          v-model="state"
          is-existing
        />

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="() => emit('close')"
          />
          <UButton
            type="submit"
            label="Save changes"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
