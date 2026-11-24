<!-- Under 18 (C-74): whether someone is under 18 and the day they turn 18, nothing more. On My
     account the person says it themselves; on a person's page staff who have seen ID record it.
     What staff recorded the person sees but cannot change. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormError } from '@nuxt/ui'
import type { RefusalView } from '../utils/refusal'

export interface AgeMarkerValue { turns18On: string, source: 'self' | 'staff' }

const props = defineProps<{
  marker: AgeMarkerValue | null
  /** Where to save: the person's own route, or a person's on the console. */
  endpoint: string
  side: 'self' | 'staff'
}>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()

const lockedForSelf = computed(() => props.side === 'self' && props.marker?.source === 'staff')
const under = ref(!!props.marker)
const turns18On = ref(props.marker?.turns18On ?? '')
watch(() => props.marker, (m) => {
  under.value = !!m
  turns18On.value = m?.turns18On ?? ''
})
const refusal = ref<RefusalView | null>(null)
const changed = computed(() => under.value !== !!props.marker || (under.value && turns18On.value !== (props.marker?.turns18On ?? '')))
const state = computed(() => ({ under: under.value, turns18On: turns18On.value }))
const schema = z.object({ under: z.boolean(), turns18On: z.string() })
  .refine(v => !v.under || !!v.turns18On, { path: ['turns18On'], message: t('core.age.turns-missing') })
const form = useTemplateRef<{ setErrors: (errors: FormError[]) => void }>('form')

async function save() {
  refusal.value = null
  try {
    await $api(props.endpoint as '/api/core/me/age', { method: 'PUT', body: { turns18On: under.value ? turns18On.value : null } })
    toast.add({ title: t(under.value ? 'core.age.saved' : 'core.age.cleared'), color: 'success' })
    emit('saved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <PageSection
    :title="t('core.age.title')"
    :description="t(side === 'self' ? 'core.age.intro-self' : 'core.age.intro-staff')"
  >
    <p
      v-if="lockedForSelf"
      class="text-sm"
    >
      {{ t('core.age.recorded-by-staff', { day: day(marker!.turns18On) }) }}
    </p>
    <UForm
      v-else
      ref="form"
      :schema="schema"
      :state="state"
      class="space-y-4"
      novalidate
      @submit="save"
    >
      <RefusalNotice :refusal="refusal" />
      <UCheckbox
        v-model="under"
        :label="t(side === 'self' ? 'core.age.under-self' : 'core.age.under-staff')"
      />
      <UFormField
        v-if="under"
        name="turns18On"
        :label="t(side === 'self' ? 'core.age.turns-self' : 'core.age.turns-staff')"
        :help="t('core.age.turns-help')"
        required
      >
        <FieldDate v-model="turns18On" />
      </UFormField>
      <UButton
        type="submit"
        loading-auto
        :disabled="!changed"
        :label="t('core.age.save')"
      />
    </UForm>
  </PageSection>
</template>
