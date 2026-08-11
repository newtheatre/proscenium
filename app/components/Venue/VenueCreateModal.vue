/**
 * Create Venue Modal Component
 *
 * Modal for creating new venues (admin/manager only).
 *
 * Features:
 * - Form validation with Zod schema
 * - Name, address, capacity, description, and status
 * - Feature selection
 * - Creates venue via POST /api/venues
 * - Toast notifications for success/error
 *
 * @emits refresh - Emitted after successful venue creation
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const emit = defineEmits<{
  refresh: []
}>()

interface VenueFeature {
  id: string
  name: string
  description?: string
  icon?: string
}

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().optional(),
  capacity: z.number().int().positive('Capacity must be positive').optional(),
  description: z.string().optional(),
  featureIds: z.array(z.string()).optional().default([]),
})

const open = ref(false)
const isSubmitting = ref(false)
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
const { data: features } = await useFetch<VenueFeature[]>('/api/venue-features')

const featureOptions = computed(() => {
  return (features.value || []).map(feature => ({
    label: `${feature.icon ? feature.icon + ' ' : ''}${feature.name}`,
    value: feature.id,
  }))
})

function resetForm() {
  state.name = undefined
  state.address = undefined
  state.capacity = undefined
  state.description = undefined
  state.featureIds = []
  imageFile.value = null
  imagePreview.value = null
}

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
    return
  }

  imageFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  try {
    const newVenue = await $fetch<{ id: string }>('/api/venues', {
      method: 'POST',
      body: event.data,
    })

    // Upload image if one was selected
    if (imageFile.value && newVenue.id) {
      const formData = new FormData()
      formData.append('image', imageFile.value)
      await $fetch(`/api/venues/${newVenue.id}/image`, {
        method: 'POST',
        body: formData,
      })
    }

    toast.add({
      title: 'Venue created',
      description: `${event.data.name} has been added`,
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
      description: getErrorMessage(error, 'Failed to create venue'),
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
    title="New Venue"
    description="Add a new venue location"
  >
    <UButton
      label="New Venue"
      icon="i-lucide-plus"
    />

    <template #body>
      <div class="space-y-6">
        <!-- Image Upload Section -->
        <div class="space-y-3">
          <label class="block text-sm font-medium">Venue Image</label>

          <div
            v-if="imagePreview"
            class="relative"
          >
            <img
              :src="imagePreview"
              alt="Preview"
              class="w-full object-cover border-default"
            >
          </div>

          <div
            v-else
            class="w-full h-48 border-2 border-default rounded-lg flex items-center justify-center bg-elevated"
          >
            <div class="text-center">
              <UIcon
                name="i-lucide-image"
                class="mx-auto w-12 text-muted"
              />
              <p class="mt-2 text-muted">
                No image selected
              </p>
            </div>
          </div>

          <div class="flex gap-2">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              class="hidden"
              @change="handleImageSelect"
            >
            <UButton
              :label="imageFile ?'Change Image' : 'Select Image'"
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              class="flex-1"
              @click="fileInputRef?.click()"
            />
            <UButton
              v-if="imageFile"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              @click="imageFile = null; imagePreview = null"
            />
          </div>
          <p class="text-xs text-muted">
            JPEG, PNG, or WebP. Max 5MB. Uploaded after venue is created.
          </p>
        </div>

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
            placeholder="Mount Street, Nottingham NG1 6HE, UK"
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

        <div class="flex justify-end gap-2 pt-4">
          <UButton
            type="button"
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="() => { open = false }"
          />
          <UButton
            type="submit"
            label="Create Venue"
            :loading="isSubmitting"
          />
        </div>
        </UForm>
      </div>
    </template>
  </UModal>
</template>
