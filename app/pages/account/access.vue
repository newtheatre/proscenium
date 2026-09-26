<script setup lang="ts">
import { ACCESS_FLAGS, ACCESS_FLAG_LABELS, declareAccessProfileForm, saysAccessProfileStatus, WITHDRAWAL_TOMBSTONE_DAYS } from '#shared/utils/access-profiles'
import { saysDayLong } from '#shared/utils/when'
import type { AccessFlag, DeclareAccessProfileInput, OwnAccessProfile } from '#shared/utils/access-profiles'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/my-nnt/access-requirements' })

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
    const { repended } = await $fetch<{ repended: boolean }>('/api/account/access-profile', { method: 'PUT', body: event.data })
    toast.add({
      title: repended ? 'Access profile saved' : 'Nothing has changed',
      description: repended
        ? 'The Accessibility Officer verifies it before it reaches anybody working the door.'
        : profile.value?.status === 'VERIFIED'
          ? 'Your requirements are as they were, so they stay verified.'
          : 'Your requirements are as they were, and still with the Accessibility Officer.',
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

// A profile in force: consent is then a switch of its own that never sends it back to the officer,
// and it can be withdrawn. A first declaration asks for consent with the rest (D-127 criterion 7).
const standing = computed(() => profile.value !== null && profile.value.status !== 'WITHDRAWN')
const switchingConsent = ref(false)

async function switchConsent(consent: boolean): Promise<void> {
  switchingConsent.value = true
  try {
    await $fetch('/api/account/access-profile/consent', { method: 'PUT', body: { consent } })
    state.consent = consent
    toast.add({
      title: consent ? 'The door may be shown your agreed wording' : 'The door is shown nothing from now on',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    switchingConsent.value = false
  }
}

const until = (at: number): string => saysDayLong(at, { year: true })

// Asked before it happens (D-127 criterion 6); a refusal stays in the dialogue that asked.
const confirmingWithdrawal = ref(false)
const withdrawFailure = ref<string | null>(null)

function askToWithdraw(): void {
  withdrawFailure.value = null
  confirmingWithdrawal.value = true
}

async function withdraw(): Promise<void> {
  withdrawing.value = true
  withdrawFailure.value = null
  try {
    await $fetch('/api/account/access-profile/withdraw', { method: 'POST' })
    confirmingWithdrawal.value = false
    toast.add({ title: 'Access profile withdrawn', icon: 'i-lucide-check', color: 'success' })
    await load()
  }
  catch (error) {
    withdrawFailure.value = refusalText(error)
  }
  finally {
    withdrawing.value = false
  }
}

const companionOptions = [0, 1, 2].map(value => ({ label: String(value), value }))

// The label is the whole row, at least 48px tall, so a tap anywhere on the line ticks its need (K-101).
const NEED_ROW = { root: 'items-center', label: 'flex min-h-12 items-center py-2' }

onMounted(load)

useSeoMeta({ title: 'Access requirements' })
</script>

<template>
  <UContainer :class="MEMBER_PAGE_WORKING">
    <UPageHeader
      title="Access requirements"
      description="Tell us what you need once, and choose exactly what the people on the door are shown. The Accessibility Officer verifies it in person before it reaches any other screen."
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
        <div
          v-if="profile"
          class="space-y-2"
        >
          <UBadge
            data-test="access-status"
            :color="profile.status === 'VERIFIED' ? 'success' : profile.status === 'DECLINED' ? 'error' : 'neutral'"
            variant="subtle"
          >
            {{ saysAccessProfileStatus(profile.status) }}
          </UBadge>
          <template v-if="profile.status === 'VERIFIED'">
            <p
              v-if="profile.fohNote"
              class="text-sm"
              data-test="access-wording"
            >
              Agreed wording for the door: <span class="font-medium">{{ profile.fohNote }}</span>
            </p>
            <p
              v-if="profile.expiresAt"
              class="text-sm text-muted"
              data-test="access-expiry"
            >
              Verified until {{ until(profile.expiresAt) }}.
            </p>
          </template>
          <p
            v-else-if="profile.status === 'EXPIRED' && profile.expiresAt"
            class="text-sm text-muted"
            data-test="access-expiry"
          >
            The verification ran out on {{ until(profile.expiresAt) }}. Save your requirements to have them checked again.
          </p>
          <p
            v-else-if="profile.status === 'DECLINED'"
            class="text-sm"
            data-test="access-decline-reason"
          >
            The Accessibility Officer could not verify this.
            <template v-if="profile.declineReason">
              Why: {{ profile.declineReason }}
            </template>
            Save your requirements to ask again.
          </p>
          <p
            v-else-if="profile.status === 'PENDING'"
            class="text-sm text-muted"
          >
            With the Accessibility Officer, who checks it in person before the door is shown anything.
          </p>
        </div>

        <UFormField
          v-if="standing"
          label="Show my agreed wording to the people on the door"
          description="Changes at once, and never sends your requirements back to be checked. While it is off, the door is shown nothing and access tickets are not offered."
        >
          <USwitch
            :model-value="state.consent"
            :loading="switchingConsent"
            data-test="access-consent"
            @update:model-value="switchConsent"
          />
        </UFormField>

        <UForm
          :schema="declareAccessProfileForm"
          :state="state"
          class="space-y-6"
          data-test="access-form"
          @submit="save"
        >
          <!-- Not a UFormField: every checkbox inside one takes the field's id, which sends every label's tap to the first need. -->
          <fieldset data-test="access-needs">
            <legend class="mb-1 text-sm font-medium text-default">
              What do you need?
            </legend>
            <UCheckbox
              v-for="flag in ACCESS_FLAGS"
              :id="`access-need-${flag}`"
              :key="flag"
              v-model="state.flags[flag]"
              :label="ACCESS_FLAG_LABELS[flag]"
              :data-test="`flag-${flag}`"
              :ui="NEED_ROW"
            />
          </fieldset>

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
            hint="Optional. Shown to nobody but the Accessibility Officer verifying this."
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

          <UFormField
            v-if="!standing"
            name="consent"
          >
            <UCheckbox
              v-model="state.consent"
              label="Show my agreed wording to the people on the door once it is verified"
              data-test="access-consent"
            />
          </UFormField>

          <p
            v-if="profile?.status === 'VERIFIED'"
            class="text-sm text-muted"
          >
            Changing a need, the companions, the note or the Access Card number sends your requirements back to be checked. Saving without a change keeps them verified.
          </p>

          <UButton
            type="submit"
            :loading="saving"
            data-test="access-save"
          >
            {{ profile ? 'Save changes' : 'Save your requirements' }}
          </UButton>
        </UForm>

        <template v-if="standing">
          <USeparator />
          <div>
            <p class="text-sm text-muted">
              Withdrawing deletes this after {{ WITHDRAWAL_TOMBSTONE_DAYS }} days. The people on the door are shown nothing in the meantime.
            </p>
            <UButton
              color="error"
              variant="subtle"
              class="mt-2"
              :loading="withdrawing"
              data-test="access-withdraw"
              @click="askToWithdraw"
            >
              Withdraw my requirements
            </UButton>
          </div>
        </template>
      </div>
    </UPageCard>

    <ConfirmModal
      v-model:open="confirmingWithdrawal"
      name="withdraw-access"
      title="Withdraw your access requirements"
      verb="Withdraw my requirements"
      :consequence="`The people on the door are shown nothing from now on, and the profile is deleted after ${WITHDRAWAL_TOMBSTONE_DAYS} days. Only you can put it back before then.`"
      :loading="withdrawing"
      :failure="withdrawFailure"
      @confirm="withdraw"
    />
  </UContainer>
</template>
