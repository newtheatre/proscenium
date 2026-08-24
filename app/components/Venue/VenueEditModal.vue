/**
 * Edit a venue, its features and its image. Admin/Manager only.
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface VenueFeature {
  id: string
  name: string
  description?: string
  icon?: string
}

interface Venue {
  id: string
  name: string
  address?: string
  capacity?: number
  imageUrl?: string
  description?: string
  isExternal?: boolean
  features: VenueFeature[]
}

const props = defineProps<{
  venue: Venue | null
}>()

const emit = defineEmits<{
  refresh: []
  close: []
}>()

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().optional(),
  capacity: z.number().int().positive('Capacity must be positive').optional(),
  description: z.string().optional(),
  isExternal: z.boolean().optional(),
  featureIds: z.array(z.string()).optional(),
})

const open = computed({
  get: () => !!props.venue,
  set: (value) => {
    if (!value) emit('close')
  },
})

const isSubmitting = ref(false)
// Staged image state: nothing is sent to the server until "Update Venue" is confirmed
const pendingImageAction = ref<'replace' | 'delete' | null>(null)
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: undefined,
  address: undefined,
  capacity: undefined,
  description: undefined,
  featureIds: [],
})

const toast = useToast()

// Fetch available features
const { data: features } = await useFetch('/api/venue-features', {
  query: { limit: 100 },
  transform: (res: Paginated<VenueFeature>) => res.rows,
})

const featureOptions = computed(() => {
  return (features.value || []).map(feature => ({
    label: `${feature.icon ? feature.icon + ' ' : ''}${feature.name}`,
    value: feature.id,
  }))
})

// Watch for venue prop changes to reset the form
watch(() => props.venue, (venue) => {
  if (venue) {
    state.name = venue.name
    state.address = venue.address
    state.capacity = venue.capacity
    state.description = venue.description
    state.isExternal = venue.isExternal ?? false
    state.featureIds = venue.features.map(f => f.id)
  }
  // Always reset staged image state when the venue prop changes
  pendingImageAction.value = null
  imageFile.value = null
  imagePreview.value = null
}, { immediate: true })

// The image src currently shown: preview if replacing, null if staged-delete, otherwise saved url
const displayImageSrc = computed(() => {
  if (pendingImageAction.value === 'replace') return imagePreview.value
  if (pendingImageAction.value === 'delete') return null
  return props.venue?.imageUrl ? `/images/${props.venue.imageUrl}` : null
})

function handleImageSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    toast.add({
      title: 'File too large',
      description: 'Image must be less than 5MB',
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
    // Reset so the same file can't be reselected without going through the picker again
    if (fileInputRef.value) fileInputRef.value.value = ''
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

function stageImageDelete() {
  pendingImageAction.value = 'delete'
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function cancelImageChange() {
  pendingImageAction.value = null
  imageFile.value = null
  imagePreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.venue) return

  isSubmitting.value = true
  try {
    await $fetch(`/api/venues/${props.venue.id}`, {
      method: 'PUT',
      // Spelled out so a cleared field sends null and actually clears it.
      // An omitted key leaves the stored value alone.
      body: {
        ...event.data,
        address: event.data.address ?? null,
        capacity: event.data.capacity ?? null,
        description: event.data.description ?? null,
      },
    })

    // Apply staged image changes
    if (pendingImageAction.value === 'replace' && imageFile.value) {
      const formData = new FormData()
      formData.append('image', imageFile.value)
      await $fetch(`/api/venues/${props.venue.id}/image`, {
        method: 'POST',
        body: formData,
      })
    }
    else if (pendingImageAction.value === 'delete') {
      await $fetch(`/api/venues/${props.venue.id}/image`, {
        method: 'DELETE',
      })
    }

    toast.add({
      title: 'Venue updated',
      description: `${event.data.name} has been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    emit('refresh')
    open.value = false
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update venue'),
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
    :title="`Edit ${venue?.name || 'Venue'}`"
    description="Update venue information and image"
  >
    <template #body>
      <div class="space-y-6">
        <!-- Image Section -->
        <div class="space-y-3">
          <label class="block text-sm font-medium">Venue Image</label>

          <!-- Image preview / current image -->
          <div
            v-if="displayImageSrc"
            class="relative"
          >
            <img
              :src="displayImageSrc"
              :alt="venue?.name"
              class="w-full h-48 object-cover rounded-lg border border-default"
            >
            <UBadge
              v-if="pendingImageAction === 'replace'"
              label="Pending"
              color="warning"
              variant="subtle"
              class="absolute top-2 left-2"
            />
          </div>

          <div
            v-else
            class="w-full h-48 border-2 border-dashed rounded-lg flex items-center justify-center bg-elevated"
            :class="pendingImageAction === 'delete' ? 'border-error/40' : 'border-default'"
          >
            <div class="text-center">
              <UIcon
                name="i-lucide-image"
                class="mx-auto h-12 w-12 text-muted"
              />
              <p class="mt-2 text-sm text-muted">
                {{ pendingImageAction === 'delete' ? 'Image will be removed on save' : 'No image uploaded' }}
              </p>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              class="hidden"
              @change="handleImageSelect"
            >
            <UButton
              :label="pendingImageAction === 'replace' ? 'Change Image' : 'Select Image'"
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              class="flex-1"
              @click="fileInputRef?.click()"
            />
            <UButton
              v-if="pendingImageAction"
              label="Cancel"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="cancelImageChange"
            />
            <UButton
              v-else-if="venue?.imageUrl"
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              @click="stageImageDelete"
            />
          </div>
          <p class="text-xs text-muted">
            JPEG, PNG, or WebP. Max 5MB. Image changes are applied when you save.
          </p>
        </div>

        <!-- Venue Details Form -->
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              placeholder="New Theatre"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Address"
            name="address"
          >
            <UTextarea
              v-model="state.address"
              placeholder="Cherry Tree Hill, Nottingham NG7 2RD"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Capacity"
            name="capacity"
            hint="Default seating capacity"
          >
            <UInputNumber
              v-model="state.capacity"
              placeholder="80"
              :min="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Description"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              placeholder="Brief description of the venue..."
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Somebody else's venue"
            name="isExternal"
            help="A venue we perform at rather than run, like a festival. We still advertise the show, but tickets are sold by the venue and we do not staff or bar it. Not for a hire of our own space."
          >
            <UCheckbox
              v-model="state.isExternal"
              label="Tickets are sold by the venue"
            />
          </UFormField>

          <UFormField
            label="Features"
            name="featureIds"
            hint="Select accessibility and amenity features"
          >
            <USelectMenu
              v-model="state.featureIds"
              :items="featureOptions"
              value-key="value"
              multiple
              searchable
              placeholder="Select features..."
              class="w-full"
            />
          </UFormField>

          <div class="flex gap-2 pt-4">
            <UButton
              type="button"
              label="Cancel"
              color="neutral"
              variant="subtle"
              @click="() => { open = false }"
            />
            <UButton
              type="submit"
              label="Update Venue"
              :loading="isSubmitting"
            />
          </div>
        </UForm>
      </div>
    </template>
  </UModal>
</template>
