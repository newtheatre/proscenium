/**
 * Create User Modal Component
 *
 * Modal for creating new user accounts (admin only).
 *
 * Features:
 * - Form validation with Zod schema
 * - Name, email, password, and role selection
 * - Creates user via POST /api/users
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
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
    .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
    .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' }),
  verified: z.boolean().optional().default(false),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional().default([]),
})

const open = ref(false)
const isSubmitting = ref(false)

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined,
  password: undefined,
  verified: false,
  roles: [],
})

const toast = useToast()

function generatePassword() {
  // Generate a random password with uppercase, lowercase, numbers
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const all = lower + upper + numbers

  // Ensure at least one of each required type
  let password = ''
  password += lower[Math.floor(Math.random() * lower.length)]
  password += upper[Math.floor(Math.random() * upper.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]

  // Fill the rest randomly
  for (let i = 0; i < 13; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  // Shuffle the password
  state.password = password.split('').sort(() => Math.random() - 0.5).join('')
}

function resetForm() {
  state.name = undefined
  state.email = undefined
  state.password = undefined
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

    // Copy password to clipboard
    if (event.data.password) {
      await navigator.clipboard.writeText(event.data.password)
    }

    toast.add({
      title: 'User created',
      description: `${event.data.name} has been added. Password copied to clipboard.`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    open.value = false
    resetForm()
    emit('refresh')
  }
  catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to create user',
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
          label="Password"
          name="password"
        >
          <div class="flex gap-2">
            <UInput
              v-model="state.password"
              type="text"
              placeholder="Enter password"
              class="flex-1"
            />
            <UButton
              label="Generate"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              @click="generatePassword"
            />
          </div>
          <template #description>
            Must be at least 8 characters with lowercase, uppercase, and number
          </template>
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
            @click="open = false"
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
