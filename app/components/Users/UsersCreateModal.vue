/**
 * Create User Modal Component
 *
 * Modal for creating new user accounts (admin only).
 *
 * Features:
 * - Form validation with Zod schema
 * - Name, email, and role selection
 * - Creates user via POST /api/users
 * - Sends password reset email so user sets their own password
 * - Toast notifications for success/error
 *
 * @emits refresh - Emitted after successful user creation
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const emit = defineEmits<{
  refresh: []
}>()

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email'),
  verified: z.boolean().optional().default(false),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional().default([]),
})

const open = ref(false)
const isSubmitting = ref(false)

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined,
  verified: false,
  roles: [],
})

const toast = useToast()

function resetForm() {
  state.name = undefined
  state.email = undefined
  state.verified = false
  state.roles = []
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  isSubmitting.value = true
  try {
    await $fetch('/api/users', {
      method: 'POST',
      body: event.data,
    })

    toast.add({
      title: 'User created',
      description: `${event.data.name} has been added. A password reset email has been sent.`,
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
      description: getErrorMessage(error, 'Failed to create user'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

const roleOptions = [
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Manager', value: 'MANAGER' },
  { label: 'Box Office', value: 'BOX_OFFICE' },
]
</script>

<template>
  <UModal
    v-model:open="open"
    title="New User"
    description="Add a new user account"
  >
    <UButton
      label="New User"
      icon="i-lucide-plus"
    />

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="John Doe"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Email"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            placeholder="john.doe@example.com"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Roles"
          name="roles"
        >
          <USelectMenu
            v-model="state.roles"
            :items="roleOptions"
            value-key="value"
            multiple
            placeholder="Select roles"
            class="w-full"
          />
        </UFormField>

        <UFormField name="verified">
          <UCheckbox
            v-model="state.verified"
            label="Email verified"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="() => { open = false }"
          />
          <UButton
            label="Create"
            type="submit"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
