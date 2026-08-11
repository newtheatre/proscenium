/**
 * Venue Features Management Slideover Component
 *
 * Slideover for managing venue features (admin/manager only).
 *
 * Features:
 * - List all venue features
 * - Create new features
 * - Edit existing features
 * - Delete features
 * - Toast notifications for success/error
 *
 * @props open - Whether the slideover is open
 * @emits update:open - Emitted when slideover open state changes
 * @emits refresh - Emitted when venues should be refreshed
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

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'refresh': []
}>()

const localOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  icon: z.string().max(4).optional().nullable(),
})

type Schema = z.output<typeof schema>

const toast = useToast()
const confirm = useConfirm()
const isCreating = ref(false)
const editingFeature = ref<VenueFeature | null>(null)
const isSubmitting = ref(false)

const state = reactive<Partial<Schema>>({
  name: undefined,
  description: undefined,
  icon: undefined,
})

// Fetch features
const { data: features, refresh: refreshFeatures } = await useFetch<VenueFeature[]>('/api/venue-features', {
  lazy: true,
})

function resetForm() {
  state.name = undefined
  state.description = undefined
  state.icon = undefined
  editingFeature.value = null
  isCreating.value = false
}

function startCreate() {
  resetForm()
  isCreating.value = true
}

function startEdit(feature: VenueFeature) {
  isCreating.value = false
  editingFeature.value = feature
  state.name = feature.name
  state.description = feature.description
  state.icon = feature.icon
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  try {
    if (editingFeature.value) {
      // Update existing feature
      await $fetch(`/api/venue-features/${editingFeature.value.id}`, {
        method: 'PUT',
        body: event.data,
      })

      toast.add({
        title: 'Feature updated',
        description: `${event.data.name} has been updated`,
        icon: 'i-lucide-check',
        color: 'success',
      })
    }
    else {
      // Create new feature
      await $fetch('/api/venue-features', {
        method: 'POST',
        body: event.data,
      })

      toast.add({
        title: 'Feature created',
        description: `${event.data.name} has been added`,
        icon: 'i-lucide-check',
        color: 'success',
      })
    }

    resetForm()
    await refreshFeatures()
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, `Failed to ${editingFeature.value ? 'update' : 'create'} feature`),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function deleteFeature(feature: VenueFeature) {
  const confirmed = await confirm({
    title: `Delete "${feature.name}"?`,
    description: 'This action cannot be undone.',
    confirmLabel: 'Delete',
  })
  if (!confirmed) return

  try {
    await $fetch(`/api/venue-features/${feature.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Feature deleted',
      description: `${feature.name} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    await refreshFeatures()
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete feature'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
}

// Common icon suggestions
const iconSuggestions = [
  '♿', '🦻', '🅿️', '🍺', '❄️', '🚶', '🚻', '🎭', '🎪', '🏛️',
  '🎨', '🎵', '📷', '🍿', '☕', '🚗', '🚇', '🚲', '🌳', '💺',
]
</script>

<template>
  <USlideover
    v-model:open="localOpen"
    title="Manage Venue Features"
    description="Add, edit, or remove venue features"
  >
    <template #body>
      <div class="space-y-1">
        <!-- Empty State -->
        <div
          v-if="!features || features.length === 0"
          class="text-center py-8 text-muted"
        >
          <UIcon
            name="i-lucide-list"
            class="mx-auto h-8 w-8 mb-2"
          />
          <p>No features yet</p>
        </div>

        <!-- Features List with Inline Editing -->
        <template
          v-for="feature in features"
          v-else
          :key="feature.id"
        >
          <!-- Inline Edit Form -->
          <div
            v-if="editingFeature?.id === feature.id"
            class="p-3 border border-default rounded-lg bg-elevated"
          >
            <UForm
              :schema="schema"
              :state="state"
              class="space-y-3"
              @submit="onSubmit"
            >
              <UFormField
                label="Name"
                name="name"
                required
              >
                <UInput
                  v-model="state.name"
                  placeholder="Wheelchair Accessible"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Icon (Emoji)"
                name="icon"
                hint="Select one, or leave blank"
              >
                <div class="grid grid-cols-10 gap-0.5">
                  <button
                    v-for="emoji in iconSuggestions"
                    :key="emoji"
                    type="button"
                    :disabled="isSubmitting"
                    :class="[
                      'text-xl p-1.5 rounded text-center leading-none',
                      state.icon === emoji ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-elevated',
                      isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                    ]"
                    @click="state.icon = state.icon === emoji ? null : emoji"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </UFormField>

              <UFormField
                label="Description"
                name="description"
              >
                <UTextarea
                  v-model="state.description"
                  placeholder="Brief description..."
                  :rows="2"
                  class="w-full"
                />
              </UFormField>

              <div class="flex gap-2">
                <UButton
                  type="button"
                  label="Cancel"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  @click="resetForm"
                />
                <UButton
                  type="submit"
                  label="Update"
                  size="sm"
                  :loading="isSubmitting"
                />
              </div>
            </UForm>
          </div>

          <!-- Feature Row -->
          <div
            v-else
            class="flex items-center justify-between rounded-lg p-3 hover:bg-elevated"
          >
            <div class="flex gap-3">
              <span
                v-if="feature.icon"
                class="text-xl"
              >{{ feature.icon }}</span>
              <div>
                <p class="font-medium">
                  {{ feature.name }}
                </p>
                <p
                  v-if="feature.description"
                  class="text-sm text-muted"
                >
                  {{ feature.description }}
                </p>
              </div>
            </div>

            <div class="flex gap-1">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                square
                @click="startEdit(feature)"
              />
              <UButton
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                size="sm"
                square
                @click="deleteFeature(feature)"
              />
            </div>
          </div>
        </template>

        <!-- Create Form -->
        <div
          v-if="isCreating"
          class="p-3 border border-default rounded-lg bg-elevated"
        >
          <UForm
            :schema="schema"
            :state="state"
            class="space-y-3"
            @submit="onSubmit"
          >
            <UFormField
              label="Name"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                placeholder="Wheelchair Accessible"
                autofocus
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Icon (Emoji)"
              name="icon"
              hint="Select one, or leave blank"
            >
              <div class="grid grid-cols-10 gap-0.5">
                <button
                  v-for="emoji in iconSuggestions"
                  :key="emoji"
                  type="button"
                  :disabled="isSubmitting"
                  :class="['text-xl p-1.5 rounded text-center leading-none',
                           state.icon === emoji ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-elevated',
                           isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
                  ]"
                  @click="state.icon = state.icon === emoji ? null : emoji"
                >
                  {{ emoji }}
                </button>
              </div>
            </UFormField>

            <UFormField
              label="Description"
              name="description"
            >
              <UTextarea
                v-model="state.description"
                placeholder="Brief description..."
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton
                type="button"
                label="Cancel"
                color="neutral"
                variant="subtle"
                size="sm"
                @click="resetForm"
              />
              <UButton
                type="submit"
                label="Create"
                size="sm"
                :loading="isSubmitting"
              />
            </div>
          </UForm>
        </div>

        <!-- Add New Feature Button -->
        <UButton
          v-else
          label="Add New Feature"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          block
          class="mt-2"
          @click="startCreate"
        />
      </div>
    </template>
  </USlideover>
</template>
