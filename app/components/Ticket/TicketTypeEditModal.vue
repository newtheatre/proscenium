/**
 * Edit a ticket type. Admin/Manager only. Price is entered in pounds and sent
 * in pence.
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface TicketType {
  id: string
  name: string
  description?: string | null
  price: number
  activeByDefault: boolean
  createdAt: string
  updatedAt: string
}

const props = defineProps<{
  ticketType: TicketType | null
}>()

const emit = defineEmits<{
  refresh: []
  close: []
}>()

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  price: z.number().nonnegative('Price must be 0 or greater'),
  activeByDefault: z.boolean(),
})

type Schema = z.output<typeof schema>

const open = computed({
  get: () => !!props.ticketType,
  set: (value) => { if (!value) emit('close') },
})

const isSubmitting = ref(false)
const toast = useToast()

const state = reactive<Partial<Schema>>({
  name: undefined,
  description: undefined,
  price: undefined,
  activeByDefault: true,
})

watch(() => props.ticketType, (tt) => {
  if (tt) {
    state.name = tt.name
    state.description = tt.description ?? undefined
    state.price = tt.price / 100 // Convert pence to £ for display
    state.activeByDefault = tt.activeByDefault
  }
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.ticketType) return
  isSubmitting.value = true
  try {
    await $fetch(`/api/ticket-types/${props.ticketType.id}`, {
      method: 'PUT',
      body: {
        name: event.data.name,
        description: event.data.description ?? null,
        price: Math.round(event.data.price * 100), // Convert £ to pence
        activeByDefault: event.data.activeByDefault,
      },
    })

    toast.add({
      title: 'Ticket type updated',
      description: `${event.data.name} has been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update ticket type'),
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
    title="Edit ticket type"
    description="Update the details for this ticket type."
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
            @click="() => { open = false }"
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
