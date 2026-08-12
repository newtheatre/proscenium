/**
 * Edit Show Modal Component
 *
 * Modal for editing a show's core details (title, slug, subtitle,
 * description, status). Performances are managed separately via the
 * PerformanceCreateModal / PerformanceEditModal components.
 *
 * @prop show — The show to edit (null = modal is closed)
 * @emits close — Emitted when the modal should be closed
 * @emits refresh — Emitted after successful update
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface Show {
  id: string
  title: string
  slug: string
  subtitle?: string | null
  description?: string | null
  longDescription?: string | null
  programmeUrl?: string | null
  externalUrl?: string | null
  contentWarningNotes?: string | null
  warningsConfirmedNone?: boolean
  posterUrl?: string | null
  status: 'DRAFT' | 'PUBLISHED'
  performances?: Array<{ id: string, status: string }>
}

const props = defineProps<{
  show: Show | null
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const toast = useToast()
const isSubmitting = ref(false)
const publishConfirmOpen = ref(false)
const isMarkingPerformances = ref(false)
const savedShowId = ref<string | null>(null)
const performanceCount = ref(0)

// Track status before edit to detect DRAFT → PUBLISHED transitions
let previousStatus: 'DRAFT' | 'PUBLISHED' = 'DRAFT'

// Poster (staged — applied only when Save changes is clicked)
const pendingImageAction = ref<'replace' | 'delete' | null>(null)
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const displayImageSrc = computed(() => {
  if (pendingImageAction.value === 'replace') return imagePreview.value
  if (pendingImageAction.value === 'delete') return null
  return props.show?.posterUrl ? `/images/${props.show.posterUrl}` : null
})

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
  contentWarningNotes: z.string().optional(),
  warningsConfirmedNone: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  title: undefined,
  slug: undefined,
  subtitle: undefined,
  description: undefined,
  longDescription: undefined,
  programmeUrl: undefined,
  externalUrl: undefined,
  contentWarningNotes: undefined,
  warningsConfirmedNone: false,
  status: 'DRAFT',
})

// ── Content warnings ─────────────────────────────────────────────────────────

type WarningKind = 'TECHNICAL' | 'ACTION' | 'DIALOGUE'

interface WarningOption { id: string, title: string }

const AXES: Array<{ kind: WarningKind, label: string, hint: string }> = [
  { kind: 'TECHNICAL', label: 'Technical effects', hint: 'Strobe, haze, loud noise' },
  { kind: 'ACTION', label: 'Depicted on stage', hint: 'Shown as part of the action' },
  { kind: 'DIALOGUE', label: 'Referred to', hint: 'Discussed rather than shown' },
]

// The vocabulary is shared across shows so the same warning means the same
// thing everywhere. Fetched once; 384 came across from the legacy site.
const { data: warningVocabulary } = useFetch<WarningOption[]>('/api/content-warnings', { lazy: true })

const selectedWarnings = reactive<Record<WarningKind, string[]>>({
  TECHNICAL: [],
  ACTION: [],
  DIALOGUE: [],
})

const warningsLoading = ref(false)

async function loadWarnings(showId: string) {
  warningsLoading.value = true
  try {
    const links = await $fetch<Array<{ contentWarningId: string, kind: WarningKind }>>(
      `/api/shows/${showId}/content-warnings`,
    )
    for (const axis of AXES) {
      selectedWarnings[axis.kind] = links.filter(l => l.kind === axis.kind).map(l => l.contentWarningId)
    }
  }
  catch {
    // Non-fatal: the rest of the editor still works. Leaving the selections
    // empty would be worse than showing nothing, because saving would then
    // silently clear the show's warnings.
    toast.add({ title: 'Could not load content warnings', description: 'Leave the warnings section alone to avoid overwriting them.', color: 'warning' })
    warningsFailed.value = true
  }
  finally {
    warningsLoading.value = false
  }
}

const warningsFailed = ref(false)

const totalSelectedWarnings = computed(() =>
  AXES.reduce((n, axis) => n + selectedWarnings[axis.kind].length, 0),
)

// Sync state when the show prop changes
watch(
  () => props.show,
  (show) => {
    if (show) {
      state.title = show.title
      state.slug = show.slug
      state.subtitle = show.subtitle ?? ''
      state.description = show.description ?? ''
      state.longDescription = show.longDescription ?? ''
      state.programmeUrl = show.programmeUrl ?? ''
      state.externalUrl = show.externalUrl ?? ''
      state.contentWarningNotes = show.contentWarningNotes ?? ''
      state.warningsConfirmedNone = show.warningsConfirmedNone ?? false
      state.status = show.status
      warningsFailed.value = false
      loadWarnings(show.id)
      previousStatus = show.status
      performanceCount.value = show.performances?.length ?? 0
    }
    // Always reset poster staged state (covers both open and close)
    pendingImageAction.value = null
    imageFile.value = null
    imagePreview.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
  },
  { immediate: true },
)

const statusItems = [
  { label: 'Draft — not visible to the public', value: 'DRAFT' },
  { label: 'Published — visible to the public', value: 'PUBLISHED' },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.show) return
  isSubmitting.value = true
  try {
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
        contentWarningNotes: event.data.contentWarningNotes || null,
        warningsConfirmedNone: event.data.warningsConfirmedNone ?? false,
        // Omitted entirely if the existing links could not be read, so a failed
        // load cannot turn into a silent wipe of the show's warnings.
        ...(warningsFailed.value
          ? {}
          : {
              contentWarnings: AXES.flatMap(axis =>
                selectedWarnings[axis.kind].map(id => ({ contentWarningId: id, kind: axis.kind })),
              ),
            }),
        status: event.data.status,
      },
    })

    // Apply staged poster change
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
      description: `"${event.data.title}" has been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    // If the show was just published and has non-cancelled performances, offer to mark them ON_SALE
    if (previousStatus === 'DRAFT' && event.data.status === 'PUBLISHED' && performanceCount.value > 0) {
      savedShowId.value = props.show.id
      publishConfirmOpen.value = true
      // Refresh but keep modal open for the publish confirm
      emit('refresh')
    }
    else {
      emit('refresh')
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
  if (!savedShowId.value) return
  isMarkingPerformances.value = true
  try {
    const result = await $fetch<{ updatedPerformanceCount: number }>(`/api/shows/${savedShowId.value}/publish`, {
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
    savedShowId.value = null
    emit('refresh')
  }
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

function stagePosterDelete() {
  pendingImageAction.value = 'delete'
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function cancelPosterChange() {
  pendingImageAction.value = null
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}
</script>

<template>
  <UModal
    :open="!!show"
    :title="`Edit: ${show?.title ?? ''}`"
    description="Update the show's details and publish status."
    @close="emit('close')"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <!-- Poster -->
        <UFormField label="Poster image">
          <div class="flex items-center gap-3">
            <div
              v-if="displayImageSrc"
              class="relative size-16 shrink-0 rounded-md overflow-hidden border border-default"
            >
              <img
                :src="displayImageSrc"
                alt="Poster"
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
                v-if="pendingImageAction || show?.posterUrl"
                :label="pendingImageAction ? 'Cancel change' : 'Remove poster'"
                size="sm"
                :color="pendingImageAction ? 'neutral' : 'error'"
                variant="ghost"
                @click="pendingImageAction ? cancelPosterChange() : stagePosterDelete()"
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

        <UFormField
          name="title"
          label="Title"
          required
        >
          <UInput
            v-model="state.title"
            placeholder="Show title"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="slug"
          label="URL slug"
          hint="Changing this will break existing links"
          required
        >
          <UInput
            v-model="state.slug"
            placeholder="show-slug"
            class="w-full"
          />
        </UFormField>

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
          label="Description"
        >
          <UTextarea
            v-model="state.description"
            placeholder="A brief description of the show..."
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <UFormField
          name="longDescription"
          label="Full description"
          help="Shown on the show page below the hero. The short description above is used on cards and listings."
        >
          <UTextarea
            v-model="state.longDescription"
            placeholder="The full write-up for the show page..."
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

        <USeparator />

        <!-- Content warnings. The "confirmed none" checkbox is the point of
             this section: a show with no warnings listed and no confirmation
             tells a customer nothing, and the page says so rather than
             implying the show is free of them. -->
        <div class="space-y-4">
          <div class="flex items-baseline justify-between gap-2">
            <h3 class="font-semibold text-default">
              Content warnings
            </h3>
            <span
              v-if="totalSelectedWarnings"
              class="text-xs text-muted"
            >{{ totalSelectedWarnings }} selected</span>
          </div>

          <UAlert
            v-if="warningsFailed"
            color="warning"
            variant="subtle"
            icon="i-lucide-alert-triangle"
            title="Content warnings could not be loaded"
            description="They will be left exactly as they are when you save. Reopen the editor to try again."
          />

          <template v-else>
            <UFormField name="warningsConfirmedNone">
              <UCheckbox
                v-model="state.warningsConfirmedNone"
                label="Confirmed: this production has no content warnings"
                help="Tick only if the company has actually checked. Left unticked with nothing selected, the show page says no information was recorded."
              />
            </UFormField>

            <div
              v-for="axis in AXES"
              :key="axis.kind"
            >
              <UFormField
                :label="axis.label"
                :help="axis.hint"
              >
                <USelectMenu
                  v-model="selectedWarnings[axis.kind]"
                  :items="warningVocabulary ?? []"
                  :loading="warningsLoading"
                  value-key="id"
                  label-key="title"
                  multiple
                  searchable
                  placeholder="None"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              name="contentWarningNotes"
              label="Notes"
              help="Anything the list above cannot express — timings, intensity, how to avoid a particular moment."
            >
              <UTextarea
                v-model="state.contentWarningNotes"
                placeholder="e.g. The strobe sequence lasts about 20 seconds in Act 2."
                class="w-full"
                :rows="3"
              />
            </UFormField>
          </template>
        </div>

        <USeparator />

        <UFormField
          name="status"
          label="Status"
        >
          <USelect
            v-model="state.status"
            :items="statusItems"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="emit('close')"
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

  <!-- Publish confirmation: offer to mark performances as on sale -->
  <UModal
    v-model:open="publishConfirmOpen"
    title="Show published!"
    :description="`Would you like to mark all ${performanceCount} performance(s) as on sale?`"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Performances are currently in <strong>Draft</strong> status. Marking them as
          <strong>On Sale</strong> will make them available for booking.
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            label="Leave as draft"
            color="neutral"
            variant="subtle"
            :disabled="isMarkingPerformances"
            @click="() => { publishConfirmOpen = false; emit('refresh') }"
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
</template>
