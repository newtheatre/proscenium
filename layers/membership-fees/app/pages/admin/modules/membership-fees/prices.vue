<!-- Fees (tab 5, scheme "Fee"): each scheme with the price in force today for joining and for renewing
     at each length, and its price history. A new price starts on a date, today or later, and replaces
     the one before from then; a price is never edited, so nobody's charge changes after they were
     quoted. A price may be for every length or one, and for joining, renewing or both. -->
<script setup lang="ts">
interface Price { id: string, lengthOptionId: string | null, amountMinor: number, currency: string, appliesTo: string, fromDate: string }
interface Scheme { id: string, name: string, state: string, requiresPayment: boolean, lengths: { id: string | null, name: string | null, join: number | null, renew: number | null }[], history: Price[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const { money } = await useMoney()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ today: string, schemes: Scheme[] }>('/api/membership-fees/schemes', { key: 'membership-fees:schemes' })

const setting = ref<Scheme | null>(null)
const form = reactive({ lengthOptionId: 'all', appliesTo: 'join-and-renew', amountMinor: null as number | null, fromDate: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openSet(s: Scheme) {
  setting.value = s
  Object.assign(form, { lengthOptionId: 'all', appliesTo: 'join-and-renew', amountMinor: null, fromDate: data.value?.today ?? '' })
  refusal.value = null
}
const lengthItems = computed(() => [{ value: 'all', label: t('membership-fees.prices.every-length') }, ...(setting.value?.lengths ?? []).filter(l => l.id).map(l => ({ value: l.id!, label: l.name! }))])
const appliesItems = computed(() => ['join-and-renew', 'join', 'renew'].map(v => ({ value: v, label: t(`membership-fees.prices.applies.${v}`) })))
async function save() {
  refusal.value = null
  try {
    await $api(`/api/membership-fees/schemes/${setting.value!.id}/prices` as string, { method: 'POST', body: { lengthOptionId: form.lengthOptionId === 'all' ? null : form.lengthOptionId, appliesTo: form.appliesTo, amountMinor: form.amountMinor, fromDate: form.fromDate } })
    toast.add({ title: t('membership-fees.prices.saved'), color: 'success' })
    setting.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const lengthName = (s: Scheme, id: string | null) => id ? s.lengths.find(l => l.id === id)?.name ?? '' : t('membership-fees.prices.every-length')
const shown = (minor: number | null) => minor === null ? t('membership-fees.prices.none') : money(minor)
</script>

<template>
  <PageFrame :title="t('membership-fees.navigation.prices.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <p
          v-if="!data.schemes.length"
          class="text-muted"
        >
          {{ t('membership-fees.prices.no-schemes') }}
        </p>
        <PageSection
          v-for="s in data.schemes"
          :key="s.id"
          :title="s.name"
          :description="s.requiresPayment ? undefined : t('membership-fees.prices.free-scheme')"
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
          <RecordList :label="s.name">
            <RecordListItem
              v-for="l in s.lengths"
              :key="l.id ?? 'all'"
              :name="l.name ?? t('membership-fees.prices.every-length')"
              :description="t('membership-fees.prices.in-force', { join: shown(l.join), renew: shown(l.renew) })"
            />
          </RecordList>
          <details
            v-if="s.history.length"
            class="mt-3 text-sm"
          >
            <summary class="cursor-pointer text-muted">
              {{ t('membership-fees.prices.history', { count: s.history.length }) }}
            </summary>
            <ul class="mt-2 space-y-1">
              <li
                v-for="p in s.history"
                :key="p.id"
              >
                {{ t('membership-fees.prices.history-line', { amount: money(p.amountMinor, p.currency), length: lengthName(s, p.lengthOptionId), applies: t(`membership-fees.prices.applies.${p.appliesTo}`), date: day(p.fromDate) }) }}
              </li>
            </ul>
          </details>
        </PageSection>
      </div>
    </DataBoundary>

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
            <USelect
              v-model="form.lengthOptionId"
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
  </PageFrame>
</template>
