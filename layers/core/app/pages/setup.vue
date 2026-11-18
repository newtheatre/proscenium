<!-- First-run setup (ID-37): the first Owner's name and address, then the theatre's name, time zone,
     country and contact address, then their passkey and recovery codes. -->
<script setup lang="ts">
import { z } from 'zod'
import type { Refusal } from '../utils/identity'
import { catalogueLabel } from '../../shared/choices'

useSeoMeta({ title: 'Set up your theatre' })
interface SetupState { needed: boolean, timeZones?: string[], countries?: string[] }
// Once the theatre is set up there is nothing here: decided before the page is made.
definePageMeta({
  middleware: async () => {
    const { data } = await useAPI<SetupState>('/api/core/setup', { key: 'core:setup' })
    if (data.value && !data.value.needed) return navigateTo('/sign-in')
  },
})
const { data: setup } = await useAPI<SetupState>('/api/core/setup', { key: 'core:setup' })

const step = ref<'owner' | 'theatre'>('owner')
const owner = reactive({ name: '', address: '' })
const theatre = reactive({ name: '', timeZone: '', country: '', contactEmail: '' })
const codes = ref<string[] | null>(null)
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
// What each step checks, shown beside each field.
const ownerSchema = z.object({ name: z.string().trim().min(1).max(120), address: z.email().max(254) }) // not-policy: the column's own lengths
const theatreSchema = z.object({
  name: z.string().trim().min(1, 'Give the theatre a name.').max(80), // not-policy: core.site.name's own length
  timeZone: z.string().min(1, 'Choose the theatre\'s time zone.'),
  country: z.string().min(1, 'Choose a country.'),
  contactEmail: z.union([z.literal(''), z.email().max(254)]), // not-policy: the setting's own length
})
const ownerForm = useTemplateRef('ownerForm')
const theatreForm = useTemplateRef('theatreForm')

const { language } = useDates()
const zoneItems = computed(() => (setup.value?.timeZones ?? []).map(z => ({ value: z, label: catalogueLabel('time-zone', z, language.value) })))
const countryItems = computed(() => (setup.value?.countries ?? [])
  .map(c => ({ value: c, label: catalogueLabel('country', c, language.value) }))
  .sort((a, b) => a.label.localeCompare(b.label, language.value)))

// The browser's own zone and region are the likeliest answers, so they come chosen.
onMounted(() => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!theatre.timeZone && zone && setup.value?.timeZones?.includes(zone)) theatre.timeZone = zone
  const region = navigator.languages?.map(l => l.split('-')[1]?.toUpperCase()).find(r => r && setup.value?.countries?.includes(r))
  if (!theatre.country) theatre.country = region ?? (setup.value?.countries?.includes('GB') ? 'GB' : '')
})

function toTheatre() {
  refusal.value = null
  if (!theatre.contactEmail) theatre.contactEmail = owner.address
  step.value = 'theatre'
}

// A refusal about the Owner sends the person back to the first step, with the field marked.
function showRefusal(answer: Refusal) {
  refusal.value = answer
  const errors = fieldErrors(answer)
  const theirs = errors.filter(e => !e.name.startsWith('theatre.'))
  if (theirs.length) {
    step.value = 'owner'
    nextTick(() => ownerForm.value?.setErrors(theirs))
  }
  else theatreForm.value?.setErrors(errors.map(e => ({ ...e, name: e.name.replace(/^theatre\./, '') })))
}

async function start() {
  busy.value = true
  refusal.value = null
  const options = await callIdentity<{ options: Parameters<typeof makePasskey>[0] }>('/api/core/setup/start', { ...owner, theatre })
  const made = options.ok ? await makePasskey(options.data.options) : options
  const saved = made.ok ? await callIdentity<{ recoveryCodes: string[] }>('/api/core/setup/passkey', { response: made.data }) : made
  busy.value = false
  if (saved.ok) codes.value = saved.data.recoveryCodes
  else showRefusal(saved.refusal)
}

async function finish(code: string) {
  const answer = await callIdentity<{ next: string }>('/api/core/setup/finish', { code })
  if (answer.ok) return arriveSignedIn(answer.data)
  refusal.value = answer.refusal
}

const description = computed(() => {
  if (codes.value) return undefined
  return step.value === 'owner'
    ? 'Step 1 of 2. You will be the first Owner. Owners can do everything, so you will sign in with a passkey.'
    : 'Step 2 of 2. About the theatre. You can change any of this later under Admin.'
})
</script>

<template>
  <IdentityCard
    title="Set up your theatre"
    :description="description"
  >
    <RefusalNotice :refusal="refusal" />
    <UForm
      v-if="!codes && step === 'owner'"
      ref="ownerForm"
      :schema="ownerSchema"
      :state="owner"
      class="flex flex-col gap-4"
      novalidate
      @submit="toTheatre"
    >
      <UFormField
        label="Your name"
        name="name"
      >
        <UInput
          v-model="owner.name"
          autocomplete="name"
        />
      </UFormField>
      <UFormField
        label="Your email address"
        name="address"
      >
        <UInput
          v-model="owner.address"
          type="email"
          autocomplete="email"
        />
      </UFormField>
      <UButton
        type="submit"
        block
        trailing-icon="i-lucide-arrow-right"
      >
        Next
      </UButton>
    </UForm>
    <UForm
      v-else-if="!codes"
      ref="theatreForm"
      :schema="theatreSchema"
      :state="theatre"
      class="flex flex-col gap-4"
      novalidate
      @submit="start"
    >
      <UFormField
        label="The theatre's name"
        name="name"
        help="Shown in the site's header, on emails and in page titles."
      >
        <UInput
          v-model="theatre.name"
          autocomplete="organization"
        />
      </UFormField>
      <UFormField
        label="Time zone"
        name="timeZone"
        help="Where the theatre is. Performance times, dates and scheduled work follow it."
      >
        <USelectMenu
          v-model="theatre.timeZone"
          :items="zoneItems"
          value-key="value"
          :search-input="{ placeholder: 'Search time zones' }"
          placeholder="Choose…"
          virtualize
        />
      </UFormField>
      <UFormField
        label="Country"
        name="country"
      >
        <USelectMenu
          v-model="theatre.country"
          :items="countryItems"
          value-key="value"
          :search-input="{ placeholder: 'Search countries' }"
          placeholder="Choose…"
          virtualize
        />
      </UFormField>
      <UFormField
        label="Contact email address"
        name="contactEmail"
        help="Where the public can write to the theatre. Leave it empty to add it later."
      >
        <UInput
          v-model="theatre.contactEmail"
          type="email"
          autocomplete="email"
        />
      </UFormField>
      <div class="flex flex-col gap-2">
        <UButton
          type="submit"
          block
          icon="i-lucide-key-round"
          :loading="busy"
        >
          Make my passkey
        </UButton>
        <UButton
          block
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :disabled="busy"
          @click="step = 'owner'"
        >
          Back
        </UButton>
      </div>
    </UForm>
    <RecoveryCodes
      v-else
      :codes="codes"
      @kept="finish"
    />
  </IdentityCard>
</template>
