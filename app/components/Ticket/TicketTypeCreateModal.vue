/**
 * Create Ticket Type Modal Component
 *
 * Modal for creating new ticket types (admin/manager only).
 *
 * Features:
 * - Form validation with Zod schema
 * - Price entered in £ (pounds) and converted to pence for the API
 * - activeByDefault toggle
 * - Creates ticket type via POST /api/ticket-types
 * - Toast notifications for success/error
 *
 * @emits refresh - Emitted after successful ticket type creation
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const emit = defineEmits<{
  refresh: []
}>()

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  price: z.number().nonnegative('Price must be 0 or greater'),
  activeByDefault: z.boolean(),
})

type Schema = z.output<typeof schema>

const open = ref(false)
const isSubmitting = ref(false)
const toast = useToast()

const state = reactive<Partial<Schema>>({
  name: undefined,
  description: undefined,
  price: undefined,
  activeByDefault: true,
})

function resetForm() {
  state.name = undefined
  state.description = undefined
  state.price = undefined
  state.activeByDefault = true
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  try {
    await $fetch('/api/ticket-types', {
      method: 'POST',
      body: {
        name: event.data.name,
        description: event.data.description || undefined,
        price: Math.round(event.data.price * 100), // Convert £ to pence
        activeByDefault: event.data.activeByDefault,
      },
    })

    toast.add({
      title: 'Ticket type created',
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
      description: getErrorMessage(error, 'Failed to create ticket type'),
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
    label="Add Ticket Type"
    icon="i-lucide-plus"
    @click="open = true"
  />

  <UModal
    v-model:open="open"
    title="Add ticket type"
    description="Create a new ticket type available for shows and performances."
    @close="resetForm"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="name"
          label="Name"
          required
        >
          <UInput
            v-model="state.name"
            placeholder="e.g. Adult, Concession, Member"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="description"
          label="Description"
        >
          <UTextarea
            v-model="state.description"
            placeholder="Brief description of who this ticket type is for"
            class="w-full"
            :rows="2"
          />
        </UFormField>

        <UFormField
          name="price"
          label="Default price (£)"
          required
        >
          <UInput
            v-model.number="state.price"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            class="w-full"
          >
            <template #leading>
              <span class="text-muted text-sm">£</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          name="activeByDefault"
          label="Active by default"
          description="When enabled, this ticket type will be automatically included when configuring a new show or performance."
        >
          <USwitch v-model="state.activeByDefault" />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="open = false"
          />
          <UButton
            type="submit"
            label="Create ticket type"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
