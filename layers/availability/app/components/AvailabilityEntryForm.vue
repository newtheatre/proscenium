<!-- Add a change (S3): dates, optionally only some weekdays, the whole day or times, a level and a
     reason the person may share with people who plan for them (A3, A7). For someone else (A8, `forAccount`)
     only busy or maybe, and the reason is never shared. -->
<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { clockOf, DAY_MINUTES, rowStarts } from '../../shared/grid'
import { LEVELS } from '../../shared/levels'

const props = defineProps<{ today: string, horizon: string, step: number, forAccount?: string }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const // not-policy: Monday 1 to Sunday 7
const REASON_MAX = 300 // not-policy: as the table's CHECK

const schema = z.object({
  dates: z.object({ start: z.string().min(1, t('availability.entry.dates-needed')), end: z.string().min(1, t('availability.entry.dates-needed')) }),
  someDays: z.boolean(),
  weekdays: z.array(z.string()),
  wholeDay: z.boolean(),
  from: z.string(),
  until: z.string(),
  level: z.enum(LEVELS),
  reason: z.string().max(REASON_MAX),
  reasonShared: z.boolean(),
}).refine(v => !v.someDays || v.weekdays.length > 0, { path: ['weekdays'], message: t('availability.entry.weekdays-needed') })
  .refine(v => v.wholeDay || v.until > v.from, { path: ['until'], message: t('availability.entry.until-after') })
type State = z.infer<typeof schema>

const state = reactive<State>({ dates: { start: props.today, end: props.today }, someDays: false, weekdays: [], wholeDay: true, from: '18:00', until: '22:00', level: 'busy', reason: '', reasonShared: false })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const times = computed(() => rowStarts(props.step).map(m => ({ label: clockOf(m), value: clockOf(m) })))
const ends = computed(() => [...rowStarts(props.step).slice(1), DAY_MINUTES].map(m => ({ label: clockOf(m), value: clockOf(m) })))
const levels = computed(() => LEVELS.filter(l => !props.forAccount || l !== 'free').map(value => ({ value, label: t(`availability.levels.${value}`) })))
const weekdays = computed(() => WEEKDAYS.map(w => ({ value: String(w), label: t(`availability.weekdays.${w}`) })))

async function save(event: FormSubmitEvent<State>) {
  refusal.value = null
  const v = event.data
  try {
    await $api(props.forAccount ? '/api/availability/on-behalf' : '/api/availability/exceptions', {
      method: 'POST',
      body: {
        ...(props.forAccount ? { accountId: props.forAccount } : {}),
        firstDate: v.dates.start,
        lastDate: v.dates.end,
        weekdays: v.someDays ? v.weekdays.map(Number) : null,
        from: v.wholeDay ? null : v.from,
        until: v.wholeDay ? null : v.until,
        level: v.level,
        reason: v.reason.trim() || null,
        reasonShared: !props.forAccount && v.reasonShared && !!v.reason.trim(),
      },
    })
    toast.add({ title: t('availability.entry.saved'), color: 'success' })
    emit('saved')
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
      :label="t('availability.entry.dates')"
      name="dates"
      required
    >
      <FieldDateRange
        v-model="state.dates"
        :min="today"
        :max="horizon"
      />
    </UFormField>
    <UFormField name="weekdays">
      <UCheckbox
        v-model="state.someDays"
        :label="t('availability.entry.some-days')"
      />
      <UCheckboxGroup
        v-if="state.someDays"
        v-model="state.weekdays"
        :items="weekdays"
        orientation="horizontal"
        class="mt-2"
        :legend="t('availability.entry.which-days')"
      />
    </UFormField>
    <UFormField name="wholeDay">
      <UCheckbox
        v-model="state.wholeDay"
        :label="t('availability.entry.whole-day')"
      />
    </UFormField>
    <div
      v-if="!state.wholeDay"
      class="flex flex-wrap gap-3"
    >
      <UFormField
        :label="t('availability.entry.from')"
        name="from"
      >
        <USelect
          v-model="state.from"
          :items="times"
          class="w-28"
        />
      </UFormField>
      <UFormField
        :label="t('availability.entry.until')"
        name="until"
      >
        <USelect
          v-model="state.until"
          :items="ends"
          class="w-28"
        />
      </UFormField>
    </div>
    <UFormField
      :label="t('availability.entry.level')"
      name="level"
      required
    >
      <URadioGroup
        v-model="state.level"
        :items="levels"
        orientation="horizontal"
      />
    </UFormField>
    <UFormField
      :label="t('availability.entry.reason')"
      :hint="t('availability.entry.optional')"
      :help="forAccount ? t('availability.behalf.reason-help') : t('availability.entry.reason-help')"
      name="reason"
    >
      <UInput
        v-model="state.reason"
        :maxlength="REASON_MAX"
      />
    </UFormField>
    <UFormField
      v-if="!forAccount"
      name="reasonShared"
    >
      <UCheckbox
        v-model="state.reasonShared"
        :disabled="!state.reason.trim()"
        :label="t('availability.entry.share')"
        :description="t('availability.entry.share-help')"
      />
    </UFormField>
    <RefusalNotice :refusal="refusal" />
    <UButton
      type="submit"
      :label="t('availability.entry.save')"
      loading-auto
    />
  </UForm>
</template>
