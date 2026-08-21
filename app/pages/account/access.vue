/**
 * Your access requirements. Recorded as the Access Card symbols because those
 * are operational statements, never a diagnosis (docs/12 §2.1).
 */
<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
  title: 'Access requirements',
})

interface Profile {
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'DECLINED' | 'WITHDRAWN'
  accessCardNumber: string | null
  difficultyStanding: boolean
  difficultyWithCrowds: boolean
  levelAccess: boolean
  distance: boolean
  urgentToilet: boolean
  visualInformation: boolean
  audibleInformation: boolean
  miscellaneous: boolean
  companions: number
  fohNote: string | null
  consentFohAt: string | null
  verifiedAt: string | null
  expiresAt: string | null
}

const SYMBOLS = [
  { key: 'levelAccess', label: 'Level access', help: 'Step-free routes, and a space to sit that does not need stairs' },
  { key: 'difficultyStanding', label: 'Difficulty standing', help: 'Queueing is hard; somewhere to sit while waiting helps' },
  { key: 'difficultyWithCrowds', label: 'Difficulty with crowds', help: 'Busy foyers are hard; early or quiet entry helps' },
  { key: 'distance', label: 'Difficulty with distance', help: 'A long walk from the door to the seat is hard' },
  { key: 'urgentToilet', label: 'Urgent toilet needs', help: 'An aisle seat near the door helps' },
  { key: 'visualInformation', label: 'Visual information', help: 'Printed or on-screen information is hard to use' },
  { key: 'audibleInformation', label: 'Audible information', help: 'Spoken announcements are hard to use' },
  { key: 'miscellaneous', label: 'Something else', help: 'Tell us in the conversation that follows' },
] as const

const requestFetch = useRequestFetch()
const toast = useToast()
const { data, refresh } = await useAsyncData('my-access', () => requestFetch<Profile | null>('/api/account/access'))

const form = reactive({
  levelAccess: false,
  difficultyStanding: false,
  difficultyWithCrowds: false,
  distance: false,
  urgentToilet: false,
  visualInformation: false,
  audibleInformation: false,
  miscellaneous: false,
  companions: 0,
  accessCardNumber: '',
  consentFoh: false,
})

watchEffect(() => {
  const profile = data.value
  if (!profile) return
  for (const symbol of SYMBOLS) form[symbol.key] = profile[symbol.key]
  form.companions = profile.companions
  form.accessCardNumber = profile.accessCardNumber ?? ''
  form.consentFoh = profile.consentFohAt !== null
})

const saving = ref(false)
const removing = ref(false)

async function save() {
  if (!form.consentFoh) {
    toast.add({ title: 'We need your consent to record this', color: 'warning' })
    return
  }
  saving.value = true
  try {
    await requestFetch('/api/account/access', {
      method: 'PUT',
      body: { ...form, accessCardNumber: form.accessCardNumber || null },
    })
    await refresh()
    toast.add({ title: 'Sent for verification', color: 'success' })
  }
  catch (error) {
    toast.add({
      title: 'That was not saved',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  removing.value = true
  try {
    await requestFetch('/api/account/access', { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Your access profile has been removed', color: 'success' })
  }
  finally {
    removing.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-2xl py-10">
    <h1 class="text-2xl font-semibold">
      Access requirements
    </h1>
    <p class="mt-2 text-sm text-muted">
      Tell us once and every future booking just works. We record what you need from the building,
      never a diagnosis, and we never keep documents of any kind.
    </p>

    <UAlert
      v-if="data && data.status !== 'WITHDRAWN'"
      class="mt-6"
      :color="data.status === 'VERIFIED' ? 'success' : 'info'"
      variant="subtle"
      :title="data.status === 'VERIFIED' ? 'Verified' : 'Waiting to be verified'"
    >
      <template #description>
        <p v-if="data.status === 'VERIFIED'">
          Recorded and in place{{ data.expiresAt ? `, until ${formatDate(data.expiresAt)}` : '' }}.
          <template v-if="data.companions">
            You can book {{ data.companions }} essential companion
            {{ data.companions === 1 ? 'ticket' : 'tickets' }}.
          </template>
        </p>
        <p v-else>
          The front-of-house manager will be in touch. Nothing is shown to anyone until they have
          confirmed it with you.
        </p>
        <p
          v-if="data.fohNote"
          class="mt-2"
        >
          <strong>What the team will see:</strong> {{ data.fohNote }}
        </p>
      </template>
    </UAlert>

    <UCard class="mt-6">
      <template #header>
        <p class="font-medium">
          What do you need?
        </p>
      </template>

      <div class="space-y-4">
        <UCheckbox
          v-for="symbol in SYMBOLS"
          :key="symbol.key"
          v-model="form[symbol.key]"
          :label="symbol.label"
          :description="symbol.help"
        />

        <UFormField
          label="Essential companion"
          help="Someone whose support you need in order to attend. Their ticket is arranged with yours."
        >
          <USelect
            v-model="form.companions"
            :items="[
              { label: 'Not needed', value: 0 },
              { label: 'One companion', value: 1 },
              { label: 'Two companions', value: 2 },
            ]"
          />
        </UFormField>

        <UFormField
          label="Access Card number"
          help="Optional, and never required. If you have one it makes verification quicker; if you do not, a conversation does the same job."
        >
          <UInput
            v-model="form.accessCardNumber"
            placeholder="Optional"
          />
        </UFormField>

        <!-- The lawful basis for the whole feature, in plain terms (ADR-0022). -->
        <UCheckbox v-model="form.consentFoh">
          <template #label>
            <span class="font-medium">I agree to this being shared with the staff working my performance</span>
          </template>
          <template #description>
            The staff team working any performance you book will be able to see your access
            requirements on the night, so they can meet them. Nobody else sees them, and you can
            remove this at any time.
          </template>
        </UCheckbox>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            :loading="saving"
            label="Save and request verification"
            @click="save"
          />
          <UButton
            v-if="data && data.status !== 'WITHDRAWN'"
            variant="ghost"
            color="error"
            :loading="removing"
            label="Remove my access profile"
            @click="remove"
          />
        </div>
      </template>
    </UCard>
  </UContainer>
</template>
