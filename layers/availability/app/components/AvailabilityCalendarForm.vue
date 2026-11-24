<!-- Connect a calendar address (S14, I1): a label, the secret address, and what tentative events
     become. It saves only after the address reads as a calendar; the address is never shown again. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { TENTATIVE_AS } from '../../shared/levels'

const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const LABEL_MAX = 40 // not-policy: as the table's CHECK
const URL_MAX = 2000 // not-policy: as part 2's limit
const schema = z.object({
  label: z.string().trim().min(1, t('availability.calendars.label-needed')).max(LABEL_MAX),
  url: z.string().trim().min(1, t('availability.calendars.address-needed')).max(URL_MAX),
  tentativeAs: z.enum(TENTATIVE_AS),
})
type State = z.infer<typeof schema>
const state = reactive<State>({ label: '', url: '', tentativeAs: 'maybe' })
const tentative = computed(() => TENTATIVE_AS.map(v => ({ value: v, label: t(`availability.calendars.tentative.${v}`) })))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function save(event: FormSubmitEvent<State>) {
  refusal.value = null
  try {
    const made = await $api<{ connectionId: string }>('/api/availability/calendars', { method: 'POST', body: event.data })
    emit('saved', made.connectionId)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    novalidate
    class="space-y-5"
    @submit="save"
  >
    <UFormField
      :label="t('availability.calendars.label')"
      :help="t('availability.calendars.label-help')"
      name="label"
      required
    >
      <UInput
        v-model="state.label"
        :maxlength="LABEL_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.calendars.address')"
      :help="t('availability.calendars.address-help')"
      name="url"
      required
    >
      <UInput
        v-model="state.url"
        type="url"
        autocomplete="off"
        :maxlength="URL_MAX"
      />
    </UFormField>
    <UAccordion
      :items="[{ label: t('availability.calendars.where'), slot: 'where' }]"
    >
      <template #where>
        <ul class="list-disc space-y-1 ps-5 text-sm text-muted">
          <li>{{ t('availability.calendars.where-google') }}</li>
          <li>{{ t('availability.calendars.where-outlook') }}</li>
          <li>{{ t('availability.calendars.where-apple') }}</li>
        </ul>
      </template>
    </UAccordion>
    <UFormField
      :label="t('availability.calendars.tentative-label')"
      name="tentativeAs"
    >
      <USelect
        v-model="state.tentativeAs"
        :items="tentative"
        class="w-48"
      />
    </UFormField>
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      icon="i-lucide-link"
      :label="t('availability.calendars.connect')"
      loading-auto
    />
  </UForm>
</template>
