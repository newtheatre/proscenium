<!-- A scheme's fee (tab 5, scheme "Fee"), drawn on the scheme's own page: the price in force today for
     joining and for renewing at each length, and its price history. A new price starts on a date,
     today or later, and replaces the one before from then; a price is never edited, so nobody's
     charge changes after they were quoted. -->
<script setup lang="ts">
interface Price { id: string, lengthOptionId: string | null, amountMinor: number, currency: string, appliesTo: string, fromDate: string }
interface Scheme { id: string, name: string, state: string, requiresPayment: boolean, lengths: { id: string | null, name: string | null, join: number | null, renew: number | null }[], history: Price[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const { money } = await useMoney()
const toast = useToast()
const props = defineProps<{ schemeId: string }>()
const emit = defineEmits<{ saved: [] }>()
const { data, refresh } = await useAPI<{ today: string, schemes: Scheme[] }>('/api/membership-fees/schemes', { key: 'membership-fees:schemes' })
// Nothing is drawn for somebody who may not manage prices: the request is refused and holds no scheme.
const s = computed(() => data.value?.schemes.find(x => x.id === props.schemeId) ?? null)

const historyOpen = ref(false)
const setting = ref<Scheme | null>(null)
const form = reactive({ lengthOptionId: 'all', appliesTo: 'join-and-renew', amountMinor: null as number | null, fromDate: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openSet(s: Scheme) {
  setting.value = s
  Object.assign(form, { lengthOptionId: 'all', appliesTo: 'join-and-renew', amountMinor: null, fromDate: data.value?.today ?? '' })
  refusal.value = null
}
const lengthItems = computed(() => [{ value: 'all', label: t('membership-fees.prices.every-length') }, ...(setting.value?.lengths ?? []).filter(l => l.id).map(l => ({ value: l.id!, label: l.name! }))])
const appliesItems = computed(() => ['join-and-renew', 'join', 'renew'].map(v => ({ value: v, label: t(`membership-fees.prices.applies-option.${v}`) })))
async function save() {
  refusal.value = null
  try {
    await $api(`/api/membership-fees/schemes/${setting.value!.id}/prices` as string, { method: 'POST', body: { lengthOptionId: form.lengthOptionId === 'all' ? null : form.lengthOptionId, appliesTo: form.appliesTo, amountMinor: form.amountMinor, fromDate: form.fromDate } })
    toast.add({ title: t('membership-fees.prices.saved'), color: 'success' })
    setting.value = null
    await refresh()
    emit('saved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const lengthName = (id: string | null) => id ? s.value?.lengths.find(l => l.id === id)?.name ?? '' : t('membership-fees.prices.every-length')
const shown = (minor: number | null) => minor === null ? t('membership-fees.prices.none') : money(minor)
</script>

<template>
  <PageSection
    v-if="s"
    :title="t('membership-fees.prices.title')"
    :description="t(s.requiresPayment ? 'membership-fees.prices.help' : 'membership-fees.prices.free-scheme')"
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="t('membership-fees.prices.set')"
        @click="openSet(s)"
      />
    </template>
    <RecordList :label="t('membership-fees.prices.title')">
      <RecordListItem
        v-for="l in s.lengths"
        :key="l.id ?? 'all'"
        :name="l.name ?? t('membership-fees.prices.every-length')"
        :description="t('membership-fees.prices.in-force', { join: shown(l.join), renew: shown(l.renew) })"
      />
    </RecordList>
    <CollapsibleDivider
      v-model:open="historyOpen"
      :label="t('membership-fees.prices.history')"
      :count="s.history.length"
    >
      <RecordList :label="t('membership-fees.prices.history')">
        <RecordListItem
          v-for="p in s.history"
          :key="p.id"
          :name="money(p.amountMinor, p.currency)"
          :description="t('membership-fees.prices.history-line', { length: lengthName(p.lengthOptionId), applies: t(`membership-fees.prices.applies.${p.appliesTo}`), date: day(p.fromDate) })"
        />
      </RecordList>
    </CollapsibleDivider>
    <UModal
      :open="!!setting"
      :title="setting ? t('membership-fees.prices.set-title', { scheme: setting.name }) : ''"
      @update:open="v => { if (!v) setting = null }"
    >
      <template #body>
        <UForm
          id="membership-fees-price"
          :state="form"
          :validate="() => needs({ amountMinor: form.amountMinor, fromDate: form.fromDate })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            v-if="lengthItems.length > 1"
            :label="t('membership-fees.prices.length')"
          >
            <USelectMenu
              v-model="form.lengthOptionId"
              value-key="value"
              :items="lengthItems"
            />
          </UFormField>
          <UFormField :label="t('membership-fees.prices.applies-to')">
            <USelect
              v-model="form.appliesTo"
              :items="appliesItems"
            />
          </UFormField>
          <UFormField
            name="amountMinor"
            :label="t('membership-fees.prices.amount')"
            required
          >
            <FieldMoney
              v-model="form.amountMinor"
              :min="1"
            />
          </UFormField>
          <UFormField
            name="fromDate"
            :label="t('membership-fees.prices.from')"
            :help="t('membership-fees.prices.from-help')"
            required
          >
            <FieldDate
              v-model="form.fromDate"
              :min="data?.today"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-fees-price"
          loading-auto
          :label="t('membership-fees.prices.save')"
        />
      </template>
    </UModal>
  </PageSection>
</template>
