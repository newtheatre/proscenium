/**
 * Edit User Modal Component
 *
 * Modal for editing user details (admin only).
 *
 * Features:
 * - Edit name, email, and roles
 * - Form validation with Zod schema
 * - Email uniqueness check
 * - Cannot edit own account (use settings)
 * - Toast notifications for success/error
 *
 * @props user - User object to edit
 * @emits refresh - Emitted after successful update
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface User {
  id: string
  name: string
  email: string
  verified: boolean
  roles: Array<'ADMIN' | 'MANAGER' | 'BOX_OFFICE'>
}

const props = defineProps<{
  user: User | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { user: currentUser } = useUserSession()
const toast = useToast()
const open = ref(false)
const isSubmitting = ref(false)

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email'),
  verified: z.boolean().optional(),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: undefined,
  email: undefined,
  verified: undefined,
  roles: undefined,
})

const isSelf = computed(() =>
  props.user?.id === currentUser.value?.id,
)

// Watch for user changes to open modal and populate form
watch(() => props.user, (newUser) => {
  if (newUser && !isSelf.value) {
    state.name = newUser.name
    state.email = newUser.email
    state.verified = newUser.verified
    state.roles = [...(newUser.roles || [])]
    open.value = true
  }
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.user) return

  isSubmitting.value = true
  try {
    await $fetch(`/api/users/${props.user.id}`, {
      method: 'PUT',
      body: event.data,
    })

    toast.add({
      title: 'User updated',
      description: `${event.data.name} has been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    open.value = false
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update user'),
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
    title="Edit User"
    :description="isSelf ? 'Use settings to edit your own account' : `Edit details for ${user?.name}`"
  >
    <slot />

    <template #body>
      <UForm
        v-if="user && !isSelf"
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
            label="Save Changes"
            type="submit"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
