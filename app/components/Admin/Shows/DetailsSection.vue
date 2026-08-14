<!--
A show's core details, editable in place on the show's own page (ADR-0017).

The page fetches the full record, so this form cannot null a field it never
received. `PUT /api/shows/:id` takes a partial body, so it saves only the
fields it owns.
-->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ShowDetail } from '~~/shared/types/shows'

const props = defineProps<{ show: ShowDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()
const isSubmitting = ref(false)

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only lowercase letters, numbers, and hyphens'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  longDescription: z.string().optional(),
  programmeUrl: z.string().url('Must be a full URL').or(z.literal('')).optional(),
  externalUrl: z.string().url('Must be a full URL').or(z.literal('')).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
})

type Schema = z.output<typeof schema>

function stateFromShow(show: ShowDetail): Schema {
  return {
    title: show.title,
    slug: show.slug,
    subtitle: show.subtitle ?? '',
    description: show.description ?? '',
    longDescription: show.longDescription ?? '',
    programmeUrl: show.programmeUrl ?? '',
    externalUrl: show.externalUrl ?? '',
    status: show.status,
  }
}

const state = reactive<Schema>(stateFromShow(props.show))

watch(() => props.show, (show) => {
  Object.assign(state, stateFromShow(show))
  clearPoster()
})

// ── Poster ───────────────────────────────────────────────────────────────────
// Staged, not applied on pick: the upload is a separate request from the field
// save, and doing it immediately would leave a half-applied edit if the form
// then failed validation.

const pendingImageAction = ref<'replace' | 'delete' | null>(null)
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const displayImageSrc = computed(() => {
  if (pendingImageAction.value === 'replace') return imagePreview.value
  if (pendingImageAction.value === 'delete') return null
  return props.show.posterUrl ? `/images/${props.show.posterUrl}` : null
})

function clearPoster() {
  pendingImageAction.value = null
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function handlePosterSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: 'File too large', description: 'Poster must be under 5 MB', icon: 'i-lucide-x-circle', color: 'error' })
    input.value = ''
    return
  }
  imageFile.value = file
  pendingImageAction.value = 'replace'
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

// ── Dirty tracking ───────────────────────────────────────────────────────────
// Without it a section that is permanently a form gives no signal about whether
// there is anything to save.

const isDirty = computed(() => {
  if (pendingImageAction.value) return true
  const original = stateFromShow(props.show)
  return (Object.keys(original) as Array<keyof Schema>).some(key => state[key] !== original[key])
})

function reset() {
  Object.assign(state, stateFromShow(props.show))
  clearPoster()
}

// ── Publish hand-off ─────────────────────────────────────────────────────────

const publishConfirmOpen = ref(false)
const isMarkingPerformances = ref(false)

const statusItems = [
  { label: 'Draft — not visible to the public', value: 'DRAFT' },
  { label: 'Published — visible to the public', value: 'PUBLISHED' },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  const wasDraft = props.show.status === 'DRAFT'
  try {
    // Only the fields this section owns. Content warnings and their notes are
    // saved by their own section, and the PUT treats an absent key as "leave it".
    await $fetch(`/api/shows/${props.show.id}`, {
      method: 'PUT',
      body: {
        title: event.data.title,
        slug: event.data.slug,
        subtitle: event.data.subtitle || null,
        description: event.data.description || null,
        longDescription: event.data.longDescription || null,
        programmeUrl: event.data.programmeUrl || null,
        externalUrl: event.data.externalUrl || null,
        status: event.data.status,
      },
    })

    if (pendingImageAction.value === 'replace' && imageFile.value) {
      const fd = new FormData()
      fd.append('poster', imageFile.value)
      await $fetch(`/api/shows/${props.show.id}/poster`, { method: 'POST', body: fd })
    }
    else if (pendingImageAction.value === 'delete') {
      await $fetch(`/api/shows/${props.show.id}/poster`, { method: 'DELETE' })
    }

    toast.add({
      title: 'Show updated',
      description: `"${event.data.title}" has been saved`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    clearPoster()
    emit('refresh')

    // Publishing a show does not publish its performances, which is the right
    // default and the wrong surprise — offer it rather than leaving a published
    // show with nothing on sale.
    if (wasDraft && event.data.status === 'PUBLISHED' && props.show.performances.length > 0) {
      publishConfirmOpen.value = true
    }
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update show'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function markPerformancesOnSale() {
  isMarkingPerformances.value = true
  try {
    const result = await $fetch<{ updatedPerformanceCount: number }>(`/api/shows/${props.show.id}/publish`, {
      method: 'POST',
      body: { markPerformancesOnSale: true },
    })
    toast.add({
      title: 'Performances updated',
      description: `${result.updatedPerformanceCount} performance(s) marked as on sale`,
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to mark performances as on sale'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isMarkingPerformances.value = false
    publishConfirmOpen.value = false
    emit('refresh')
  }
}
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
      Details
    </h2>

    <UCard>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Poster image">
          <div class="flex flex-wrap items-center gap-3">
            <div
              v-if="displayImageSrc"
              class="relative size-16 shrink-0 rounded-md overflow-hidden border border-default"
            >
              <img
                :src="displayImageSrc"
                alt=""
                class="w-full h-full object-cover"
              >
            </div>
            <div
              v-else
              class="size-16 shrink-0 rounded-md border border-dashed border-default flex items-center justify-center text-muted"
            >
              <UIcon
                name="i-lucide-image"
                class="size-6"
              />
            </div>
            <div class="flex flex-col gap-1">
              <UButton
                :label="displayImageSrc ? 'Change poster' : 'Upload poster'"
                icon="i-lucide-upload"
                color="neutral"
                variant="outline"
                size="sm"
                @click="fileInputRef?.click()"
              />
              <UButton
                v-if="pendingImageAction || show.posterUrl"
                :label="pendingImageAction ? 'Cancel change' : 'Remove poster'"
                size="sm"
                :color="pendingImageAction ? 'neutral' : 'error'"
                variant="ghost"
                @click="pendingImageAction ? clearPoster() : (pendingImageAction = 'delete')"
              />
              <p class="text-xs text-muted">
                JPEG, PNG or WebP, max 5 MB
              </p>
            </div>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            @change="handlePosterSelect"
          >
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            name="title"
            label="Title"
            required
          >
            <UInput
              v-model="state.title"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="slug"
            label="URL slug"
            help="Changing this will break existing links."
          >
            <UInput
              v-model="state.slug"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          name="subtitle"
          label="Subtitle"
        >
          <UInput
            v-model="state.subtitle"
            placeholder="Optional subtitle or tagline"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="description"
          label="Short description"
          help="Used on cards and listings."
        >
          <UTextarea
            v-model="state.description"
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <UFormField
          name="longDescription"
          label="Full description"
          help="Shown on the show page below the hero."
        >
          <UTextarea
            v-model="state.longDescription"
            class="w-full"
            :rows="6"
          />
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            name="programmeUrl"
            label="Digital programme"
            help="Link to the programme, if there is one."
          >
            <UInput
              v-model="state.programmeUrl"
              type="url"
              placeholder="https://..."
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="externalUrl"
            label="External booking link"
            help="For shows we host but do not sell for. Setting this replaces our booking button."
          >
            <UInput
              v-model="state.externalUrl"
              type="url"
              placeholder="https://..."
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          name="status"
          label="Status"
        >
          <USelect
            v-model="state.status"
            :items="statusItems"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>

        <div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-default">
          <UButton
            label="Discard changes"
            color="neutral"
            variant="ghost"
            :disabled="!isDirty || isSubmitting"
            @click="reset"
          />
          <UButton
            type="submit"
            label="Save details"
            :disabled="!isDirty"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </UCard>

    <!-- Publishing a show leaves its performances in draft; offer the follow-up. -->
    <UModal
      v-model:open="publishConfirmOpen"
      title="Show published"
      :description="`Mark all ${show.performances.length} performance(s) as on sale?`"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Performances are still in <strong>Draft</strong>. Marking them
            <strong>On sale</strong> makes them available for booking.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Leave as draft"
              color="neutral"
              variant="subtle"
              :disabled="isMarkingPerformances"
              @click="publishConfirmOpen = false"
            />
            <UButton
              label="Mark all as on sale"
              icon="i-lucide-ticket"
              :loading="isMarkingPerformances"
              @click="markPerformancesOnSale"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
