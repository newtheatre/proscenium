<script setup lang="ts">
import { ACCESS_FLAGS, ACCESS_FLAG_LABELS, declareAccessProfileForm } from '#shared/utils/access-profiles'
import type { AccessFlag, DeclareAccessProfileInput, OwnAccessProfile } from '#shared/utils/access-profiles'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const withdrawing = ref(false)
const profile = ref<OwnAccessProfile | null>(null)

const emptyFlags = (): Record<AccessFlag, boolean> =>
  Object.fromEntries(ACCESS_FLAGS.map(flag => [flag, false])) as Record<AccessFlag, boolean>

// Plain strings, not the form's z.output shape: blank becomes no answer on the way out, the same
// convention the account profile form uses.
const state = reactive({
  flags: emptyFlags(),
  companions: 0,
  requesterNote: '',
  accessCardNumber: '',
  consent: false,
})

async function load(): Promise<void> {
  loading.value = true
  const { profile: own } = await $fetch<{ profile: OwnAccessProfile | null }>('/api/account/access-profile')
  profile.value = own
  if (own) {
    Object.assign(state, {
      flags: own.flags,
      companions: own.companions,
      requesterNote: own.requesterNote ?? '',
      accessCardNumber: own.accessCardNumber ?? '',
      consent: own.consentGiven,
    })
  }
  loading.value = false
}

async function save(event: FormSubmitEvent<DeclareAccessProfileInput>): Promise<void> {
  saving.value = true
  try {
    await $fetch('/api/account/access-profile', { method: 'PUT', body: event.data })
    toast.add({
      title: 'Access profile saved',
      description: 'An accessibility officer will verify it before the door sees anything.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function withdraw(): Promise<void> {
  withdrawing.value = true
  try {
    await $fetch('/api/account/access-profile/withdraw', { method: 'POST' })
    toast.add({ title: 'Access profile withdrawn', icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    withdrawing.value = false
  }
}

const companionOptions = [0, 1, 2].map(value => ({ label: String(value), value }))

onMounted(load)

useSeoMeta({ title: 'Access requirements' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Access requirements"
      description="Tell us what you need once, and control exactly what the door sees. This is verified in person by an accessibility officer before it reaches any other screen."
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
        <span>Reading your access profile.</span>
      </div>

      <div
        v-else
        class="space-y-6"
      >
        <UBadge
          v-if="profile"
          data-test="access-status"
          :color="profile.status === 'VERIFIED' ? 'success' : profile.status === 'DECLINED' ? 'error' : 'neutral'"
          variant="subtle"
        >
          {{ profile.status }}
        </UBadge>

        <UForm
          :schema="declareAccessProfileForm"
          :state="state"
          class="space-y-6"
          data-test="access-form"
          @submit="save"
        >
          <UFormField label="What do you need?">
            <div class="space-y-2">
              <UCheckbox
                v-for="flag in ACCESS_FLAGS"
                :key="flag"
                v-model="state.flags[flag]"
                :label="ACCESS_FLAG_LABELS[flag]"
                :data-test="`flag-${flag}`"
              />
            </div>
          </UFormField>

          <UFormField
            label="Companions"
            name="companions"
            description="Up to two people admitted alongside you at no charge, once verified."
          >
            <USelect
              v-model="state.companions"
              :items="companionOptions"
              value-key="value"
              class="w-32"
              data-test="access-companions"
            />
          </UFormField>

          <UFormField
            label="Anything else, in your own words"
            name="requesterNote"
            hint="Optional. Never shown to the door: it helps the officer verifying this only."
          >
            <UTextarea
              v-model="state.requesterNote"
              class="w-full"
              data-test="access-note"
            />
          </UFormField>

          <UFormField
            label="Access Card number"
            name="accessCardNumber"
            hint="Optional. The quickest way to verify, if you have one. Cleared the moment it is checked."
          >
            <UInput
              v-model="state.accessCardNumber"
              class="w-full"
              data-test="access-card-number"
            />
          </UFormField>

          <UFormField name="consent">
            <UCheckbox
              v-model="state.consent"
              label="Let the door see my agreed wording once verified"
              data-test="access-consent"
            />
          </UFormField>

          <UButton
            type="submit"
            :loading="saving"
            data-test="access-save"
          >
            {{ profile ? 'Save changes' : 'Submit' }}
          </UButton>
        </UForm>

        <template v-if="profile && profile.status !== 'WITHDRAWN'">
          <USeparator />
          <div>
            <p class="text-sm text-muted">
              Withdrawing deletes this after 30 days. Nothing is shown to the door in the meantime.
            </p>
            <UButton
              color="error"
              variant="subtle"
              class="mt-2"
              :loading="withdrawing"
              data-test="access-withdraw"
              @click="withdraw"
            >
              Withdraw
            </UButton>
          </div>
        </template>
      </div>
    </UPageCard>
  </UContainer>
</template>
