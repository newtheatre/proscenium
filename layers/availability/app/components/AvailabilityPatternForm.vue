<!-- A new weekly pattern (S2): a name, the dates it covers and, to save painting it again, the times
     of an earlier pattern ("Copy from last term"). -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PatternRow } from '../composables/usePatterns'

const props = defineProps<{ patterns: PatternRow[], today: string, horizon: string }>()
const emit = defineEmits<{ saved: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const LABEL_MAX = 40 // not-policy: as the table's CHECK
const schema = z.object({
  label: z.string().trim().min(1, t('availability.patterns.label-needed')).max(LABEL_MAX),
  startsOn: z.string().min(1, t('availability.patterns.starts-needed')),
  endsOn: z.string().nullable(),
  copyFrom: z.string(),
}).refine(v => !v.endsOn || v.endsOn >= v.startsOn, { path: ['endsOn'], message: t('availability.patterns.ends-after') })
type State = z.infer<typeof schema>

const latest = props.patterns[0]
const state = reactive<State>({ label: '', startsOn: props.today, endsOn: null, copyFrom: latest?.id ?? 'none' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const copyItems = computed(() => [{ value: 'none', label: t('availability.patterns.copy-none') }, ...props.patterns.map(p => ({ value: p.id, label: p.label }))])

async function save(event: FormSubmitEvent<State>) {
  refusal.value = null
  const v = event.data
  try {
    const made = await $api<{ patternId: string }>('/api/availability/patterns', {
      method: 'POST',
      body: { label: v.label, startsOn: v.startsOn, endsOn: v.endsOn || null, lines: props.patterns.find(p => p.id === v.copyFrom)?.lines ?? [] },
    })
    emit('saved', made.patternId)
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
      :label="t('availability.patterns.label')"
      :help="t('availability.patterns.label-help')"
      name="label"
      required
    >
      <UInput
        v-model="state.label"
        :maxlength="LABEL_MAX"
      />
    </UFormField>
    <UFormField
      :label="t('availability.patterns.starts')"
      name="startsOn"
      required
    >
      <FieldDate
        v-model="state.startsOn"
        :max="horizon"
      />
    </UFormField>
    <UFormField
      :label="t('availability.patterns.ends')"
      :hint="t('availability.entry.optional')"
      :help="t('availability.patterns.ends-help')"
      name="endsOn"
    >
      <FieldDate
        v-model="state.endsOn"
        :min="state.startsOn"
      />
    </UFormField>
    <UFormField
      v-if="patterns.length"
      :label="t('availability.patterns.copy')"
      name="copyFrom"
    >
      <USelect
        v-model="state.copyFrom"
        :items="copyItems"
      />
    </UFormField>
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      :label="t('availability.patterns.create')"
      loading-auto
    />
  </UForm>
</template>
