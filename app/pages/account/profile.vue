<script setup lang="ts">
import { AUDIENCES, PROFILE_FIELDS, profileForm } from '#shared/utils/profile'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

type Profile = z.output<typeof profileForm> & { email: string }

const toast = useToast()
const { refresh } = useAccount()
const loading = ref(true)
const saving = ref(false)

// Empty strings rather than nulls: an input binds to a string, and the schema turns blank back
// into no answer on the way out.
const state = reactive({
  name: '',
  pronouns: '',
  phone: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
})
const email = ref('')

// The audience is read from the field registry rather than written into the template, so a field
// added without one is a failing test rather than a screen that quietly says nothing (A-114).
const audienceOf = (name: string): string =>
  AUDIENCES[PROFILE_FIELDS.find(field => field.name === name)?.audience ?? 'officers']

async function load(): Promise<void> {
  const { profile } = await $fetch<{ profile: Profile }>('/api/account/profile')
  Object.assign(state, {
    name: profile.name,
    pronouns: profile.pronouns ?? '',
    phone: profile.phone ?? '',
    emergencyName: profile.emergencyName ?? '',
    emergencyPhone: profile.emergencyPhone ?? '',
    emergencyRelation: profile.emergencyRelation ?? '',
  })
  email.value = profile.email
  loading.value = false
}

async function save(event: FormSubmitEvent<z.output<typeof profileForm>>): Promise<void> {
  saving.value = true
  try {
    await $fetch('/api/account/profile', { method: 'PUT', body: event.data })
    await refresh()
    toast.add({ title: 'Profile saved', icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

onMounted(load)

useSeoMeta({ title: 'Profile' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Profile"
      description="What the theatre holds about you, and who can see each part of it."
    />

    <UPageCard class="mt-8">
      <div
        v-if="loading"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Reading your profile.</span>
      </div>

      <UForm
        v-else
        :schema="profileForm"
        :state="state"
        class="space-y-6"
        data-test="profile-form"
        @submit="save"
      >
        <UFormField
          label="Name"
          name="name"
          required
          :description="audienceOf('name')"
        >
          <UInput
            v-model="state.name"
            class="w-full"
            data-test="profile-name"
          />
        </UFormField>

        <UFormField
          label="Pronouns"
          name="pronouns"
          :description="audienceOf('pronouns')"
          hint="Optional"
        >
          <UInput
            v-model="state.pronouns"
            placeholder="she/her, they/them, anything you use"
            class="w-full"
            data-test="profile-pronouns"
          />
        </UFormField>

        <UFormField
          label="Phone number"
          name="phone"
          :description="audienceOf('phone')"
          hint="Optional"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            class="w-full"
            data-test="profile-phone"
          />
        </UFormField>

        <UFormField
          label="Email address"
          :description="audienceOf('name')"
        >
          <UInput
            :model-value="email"
            disabled
            class="w-full"
          />
          <template #help>
            <ULink to="/account/security">
              Change your email address
            </ULink>
          </template>
        </UFormField>

        <USeparator label="Emergency contact" />

        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :description="audienceOf('emergencyName')"
        />

        <UFormField
          label="Their name"
          name="emergencyName"
          hint="Optional"
        >
          <UInput
            v-model="state.emergencyName"
            class="w-full"
            data-test="profile-emergency-name"
          />
        </UFormField>

        <UFormField
          label="Their phone number"
          name="emergencyPhone"
        >
          <UInput
            v-model="state.emergencyPhone"
            type="tel"
            class="w-full"
            data-test="profile-emergency-phone"
          />
        </UFormField>

        <UFormField
          label="How you know them"
          name="emergencyRelation"
          hint="Optional"
        >
          <UInput
            v-model="state.emergencyRelation"
            placeholder="Mother, partner, housemate"
            class="w-full"
            data-test="profile-emergency-relation"
          />
        </UFormField>

        <UButton
          type="submit"
          :loading="saving"
          data-test="profile-save"
        >
          Save
        </UButton>
      </UForm>
    </UPageCard>
  </UContainer>
</template>
