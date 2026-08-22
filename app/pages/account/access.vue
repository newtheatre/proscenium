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
  requesterNote: string | null
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

/**
 * Framed as what someone finds *difficult*, never as what they want provided.
 * "Visual information" reads as a preference: a deaf person would tick it.
 */
const SYMBOLS = [
  { key: 'levelAccess', label: 'Stairs and steps are a barrier for me', help: 'You need a step-free route to your seat' },
  { key: 'difficultyStanding', label: 'I find standing or queueing difficult', help: 'Somewhere to sit while waiting helps' },
  { key: 'difficultyWithCrowds', label: 'I find busy or crowded spaces difficult', help: 'Coming in early, or by a quieter route, helps' },
  { key: 'distance', label: 'I find walking any distance difficult', help: 'A long walk from the door to the seat is hard' },
  { key: 'urgentToilet', label: 'I may need to leave quickly for the toilet', help: 'An aisle seat near a door helps' },
  { key: 'audibleInformation', label: 'I find it hard to hear spoken announcements', help: 'You would rather have things in writing' },
  { key: 'visualInformation', label: 'I find it hard to read printed or on-screen information', help: 'You would rather be told out loud' },
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
  companions: 0,
  accessCardNumber: '',
  requesterNote: '',
  consentFoh: false,
})

/** Verified profiles show a summary; the form is opened deliberately. */
const editing = ref(false)
const settled = computed(() => data.value?.status === 'VERIFIED' && !editing.value)

watchEffect(() => {
  const profile = data.value
  if (!profile) return
  for (const symbol of SYMBOLS) form[symbol.key] = profile[symbol.key]
  form.companions = profile.companions
  form.accessCardNumber = profile.accessCardNumber ?? ''
  form.requesterNote = profile.requesterNote ?? ''
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
      body: {
        ...form,
        accessCardNumber: form.accessCardNumber || null,
        requesterNote: form.requesterNote || null,
      },
    })
    editing.value = false
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
      :title="data.status === 'VERIFIED' ? 'All set' : 'Waiting to be verified'"
    >
      <template #description>
        <p v-if="data.status === 'VERIFIED'">
          Recorded and in place{{ data.expiresAt ? `, until ${formatDate(data.expiresAt)}` : '' }}.
          <template v-if="data.companions">
            You can book {{ data.companions }} essential companion
            {{ data.companions === 1 ? 'ticket' : 'tickets' }} with your own.
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

    <!-- Settled: a summary and a way back in, not a form to re-read. -->
    <UCard
      v-if="settled && data"
      class="mt-6"
    >
      <template #header>
        <p class="font-medium">
          What we have recorded
        </p>
      </template>
      <ul class="list-disc space-y-1 pl-5 text-sm">
        <li
          v-for="symbol in SYMBOLS.filter(sym => data![sym.key])"
          :key="symbol.key"
        >
          {{ symbol.label }}
        </li>
        <li v-if="data.companions">
          {{ data.companions }} essential companion {{ data.companions === 1 ? 'ticket' : 'tickets' }}
        </li>
        <li v-if="!SYMBOLS.some(sym => data![sym.key]) && !data.companions">
          Nothing ticked: only the note below.
        </li>
      </ul>
      <p
        v-if="data.requesterNote"
        class="mt-3 text-sm"
      >
        <span class="text-muted">What you told us:</span> {{ data.requesterNote }}
      </p>
      <template #footer>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            variant="subtle"
            label="Update my requirements"
            @click="editing = true"
          />
          <UButton
            variant="ghost"
            color="error"
            :loading="removing"
            label="Remove my access profile"
            @click="remove"
          />
        </div>
      </template>
    </UCard>

    <UCard
      v-else
      class="mt-6"
    >
      <template #header>
        <p class="font-medium">
          What do you find difficult?
        </p>
        <p class="text-sm text-muted">
          Tick what applies. These are about what is hard, not about what you would like us to
          provide, so tick the thing you struggle with.
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
          label="Anything else we should know"
          help="In your own words. Tell us what you need from us rather than why: this goes to the front-of-house manager for the conversation, and is not shown to the team on the night."
        >
          <UTextarea
            v-model="form.requesterNote"
            :rows="3"
            placeholder="e.g. I use a wheelchair and transfer to an aisle seat; the chair needs storing somewhere"
            class="w-full"
          />
        </UFormField>

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
            v-if="editing"
            variant="ghost"
            label="Cancel"
            @click="editing = false"
          />
          <UButton
            v-else-if="data && data.status !== 'WITHDRAWN'"
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
