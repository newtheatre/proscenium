<!-- First-run setup (ID-37): the theatre's name and time zone (AC-11), the first Owner's name,
     address and passkey, then their recovery codes. -->
<script setup lang="ts">
import { z } from 'zod'
import type { Refusal } from '../utils/identity'
import { catalogueValues } from '../../kit/catalogues'
import { catalogueLabel } from '../../shared/choices'

useSeoMeta({ title: 'Set up your theatre' })
// Once the theatre is set up there is nothing here: decided before the page is made.
definePageMeta({
  middleware: async () => {
    const { data } = await useAPI<{ needed: boolean }>('/api/core/setup', { key: 'core:setup' })
    if (data.value && !data.value.needed) return navigateTo('/sign-in')
  },
})
const { t } = useT()
const theatre = ref('')
// The device's own zone is the likeliest, so it is chosen first.
const zones = catalogueValues('time-zone')
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const timeZone = ref(zones.includes(deviceZone) ? deviceZone : 'Europe/London')
const zoneItems = zones.map(value => ({ value, label: catalogueLabel('time-zone', value, 'en-GB') }))
const name = ref('')
const address = ref('')
const codes = ref<string[] | null>(null)
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
// What setup's first step checks, shown beside each field.
const ownerSchema = z.object({
  theatre: z.string().trim().min(1).max(80), // not-policy: the setting's own length
  timeZone: z.string().min(1),
  name: z.string().trim().min(1).max(120), // not-policy: the column's own length
  address: z.email().max(254), // not-policy: the longest address
})
const ownerForm = useTemplateRef('ownerForm')

async function start() {
  busy.value = true
  refusal.value = null
  const options = await callIdentity<{ options: Parameters<typeof makePasskey>[0] }>('/api/core/setup/start', { name: name.value, address: address.value, theatre: theatre.value.trim(), timeZone: timeZone.value })
  const made = options.ok ? await makePasskey(options.data.options) : options
  const saved = made.ok ? await callIdentity<{ recoveryCodes: string[] }>('/api/core/setup/passkey', { response: made.data }) : made
  busy.value = false
  if (saved.ok) codes.value = saved.data.recoveryCodes
  else {
    refusal.value = saved.refusal
    ownerForm.value?.setErrors(fieldErrors(saved.refusal))
  }
}

async function finish(code: string) {
  const answer = await callIdentity<{ next: string }>('/api/core/setup/finish', { code })
  if (answer.ok) return arriveSignedIn(answer.data)
  refusal.value = answer.refusal
}
</script>

<template>
  <IdentityCard
    title="Set up your theatre"
    :description="codes ? undefined : 'You will be the first Owner. Owners can do everything, so you will sign in with a passkey.'"
  >
    <RefusalNotice :refusal="refusal" />
    <UForm
      v-if="!codes"
      ref="ownerForm"
      :schema="ownerSchema"
      :state="{ theatre, timeZone, name, address }"
      class="flex flex-col gap-4"
      novalidate
      @submit="start"
    >
      <UFormField
        :label="t('core.setup.theatre')"
        :help="t('core.setup.theatre-help')"
        name="theatre"
      >
        <UInput
          v-model="theatre"
          maxlength="80"
          autocomplete="organization"
        />
      </UFormField>
      <UFormField
        :label="t('core.setup.time-zone')"
        :help="t('core.setup.time-zone-help')"
        name="timeZone"
      >
        <USelectMenu
          v-model="timeZone"
          :items="zoneItems"
          value-key="value"
          :search-input="{ placeholder: t('core.setup.time-zone-search') }"
        />
      </UFormField>
      <UFormField
        label="Your name"
        name="name"
      >
        <UInput
          v-model="name"
          autocomplete="name"
        />
      </UFormField>
      <UFormField
        label="Your email address"
        name="address"
      >
        <UInput
          v-model="address"
          type="email"
          autocomplete="email"
        />
      </UFormField>
      <UButton
        type="submit"
        block
        icon="i-lucide-key-round"
        :loading="busy"
      >
        Make my passkey
      </UButton>
    </UForm>
    <RecoveryCodes
      v-else
      :codes="codes"
      @kept="finish"
    />
  </IdentityCard>
</template>
