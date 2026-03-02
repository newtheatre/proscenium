<script setup lang="ts">
/**
 * Customer details step.
 *
 * Collects name, email, and optional notes from the customer.
 * Auto-fills from the user's session if they are logged in.
 */
import { z } from 'zod/v4'

interface CustomerInfo {
  name: string
  email: string
  customerNotes: string
}

const props = defineProps<{
  modelValue: CustomerInfo
  isLoggedIn: boolean
  userName?: string
  userEmail?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CustomerInfo]
}>()

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email address'),
  customerNotes: z.string().optional(),
})

function updateField<K extends keyof CustomerInfo>(key: K, value: CustomerInfo[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-semibold text-default">
        Your Details
      </h3>
      <p class="text-sm text-muted mt-1">
        {{ isLoggedIn ? 'We\'ll use your account details for this booking.' : 'We just need a few details to complete your booking.' }}
      </p>
    </div>

    <!-- Logged-in user card -->
    <UCard
      v-if="isLoggedIn"
      :ui="{ body: 'sm:flex sm:items-center sm:gap-4' }"
    >
      <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <UIcon
          name="i-lucide-user-check"
          class="size-6 text-primary"
        />
      </div>
      <div class="mt-3 sm:mt-0">
        <p class="font-semibold text-default">
          {{ userName }}
        </p>
        <p class="text-sm text-muted">
          {{ userEmail }}
        </p>
      </div>
      <UBadge
        label="Logged In"
        color="success"
        variant="subtle"
        class="mt-3 sm:mt-0 sm:ml-auto"
      />
    </UCard>

    <UForm
      :schema="schema"
      :state="modelValue"
    >
      <!-- Contact details -->
      <UCard :ui="{ body: 'space-y-5' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-user"
              class="size-5 text-primary"
            />
            <h4 class="font-semibold text-default">
              Contact Information
            </h4>
          </div>
        </template>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            name="name"
            label="Full Name"
            required
          >
            <UInput
              :model-value="modelValue.name"
              placeholder="Your full name"
              icon="i-lucide-user"
              size="lg"
              :disabled="isLoggedIn"
              @update:model-value="updateField('name', $event as string)"
            />
          </UFormField>

          <UFormField
            name="email"
            label="Email Address"
            required
          >
            <UInput
              :model-value="modelValue.email"
              type="email"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="lg"
              :disabled="isLoggedIn"
              @update:model-value="updateField('email', $event as string)"
            />
          </UFormField>
        </div>

        <p class="text-xs text-muted">
          <UIcon
            name="i-lucide-info"
            class="size-3.5 align-text-bottom"
          />
          Your booking confirmation will be sent to this email address.
        </p>
      </UCard>

      <!-- Special requirements -->
      <UCard
        class="mt-4"
        :ui="{ body: 'space-y-4' }"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-accessibility"
              class="size-5 text-primary"
            />
            <div>
              <h4 class="font-semibold text-default">
                Special Requirements
              </h4>
              <p class="text-xs text-muted mt-0.5">
                Optional — let us know about any needs so we can help
              </p>
            </div>
          </div>
        </template>

        <UFormField name="customerNotes">
          <UTextarea
            :model-value="modelValue.customerNotes"
            placeholder="e.g. Wheelchair access needed, hearing loop required, assistance dog..."
            :rows="3"
            size="lg"
            @update:model-value="updateField('customerNotes', $event as string)"
          />
        </UFormField>
      </UCard>
    </UForm>

    <!-- Guest prompt -->
    <UCard
      v-if="!isLoggedIn"
      :ui="{ body: 'sm:flex sm:items-center sm:justify-between sm:gap-4' }"
      variant="subtle"
    >
      <div class="flex items-start gap-3">
        <UIcon
          name="i-lucide-log-in"
          class="size-5 text-primary mt-0.5 shrink-0"
        />
        <div>
          <p class="font-medium text-default text-sm">
            Already have an account?
          </p>
          <p class="text-xs text-muted mt-0.5">
            Log in to save this booking to your account and skip entering details next time.
          </p>
        </div>
      </div>
      <UButton
        label="Log In"
        icon="i-lucide-log-in"
        color="primary"
        variant="soft"
        size="sm"
        class="mt-3 sm:mt-0 shrink-0"
        :to="`/login?redirect=${encodeURIComponent($route.fullPath)}`"
      />
    </UCard>
  </div>
</template>
