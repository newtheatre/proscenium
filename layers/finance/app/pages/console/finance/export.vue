<!-- Export (Box office specification, part 5; FIN-05): the ledger as CSV for an accounting package,
     one row per entry with account codes, for a range of days. A period can be chosen to fill in its
     dates. -->
<script setup lang="ts">
interface Period { id: string, label: string, startsOn: string, endsOn: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data } = await useAPI<{ periods: Period[] }>('/api/finance/periods', { key: 'finance:periods' })
const form = reactive({ from: '', to: '' })
const period = ref<string | undefined>(undefined)
watch(period, (id) => {
  const p = data.value?.periods.find(x => x.id === id)
  if (p) Object.assign(form, { from: p.startsOn, to: p.endsOn })
})
const href = computed(() => (form.from && form.to ? `/api/finance/export?${new URLSearchParams({ from: form.from, to: form.to })}` : undefined))

// The file downloads by its link; a refusal (too many lines, the range backwards) is fetched and
// shown here instead, so the person never lands on a page of JSON.
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
async function download() {
  if (!href.value) return
  busy.value = true
  refusal.value = null
  try {
    const csv = await $api<string>(href.value, { responseType: 'text' })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${form.from}-to-${form.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="t('finance.navigation.export.label')"
    :description="t('finance.screens.export.help')"
    width="reading"
  >
    <UForm
      class="space-y-4"
      :state="form"
      :validate="() => needs({ from: form.from, to: form.to })"
      novalidate
      @submit="download"
    >
      <RefusalNotice :refusal="refusal" />
      <UFormField
        v-if="data?.periods.length"
        :label="t('finance.screens.export.period')"
        :hint="t('finance.screens.optional')"
        :help="t('finance.screens.export.period-help')"
      >
        <USelectMenu
          v-model="period"
          value-key="value"
          :items="[...data.periods].reverse().map(p => ({ value: p.id, label: p.label }))"
          :placeholder="t('finance.screens.export.period-placeholder')"
          class="sm:w-64"
        />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          name="from"
          :label="t('finance.screens.export.from')"
          required
        >
          <FieldDate
            v-model="form.from"
            :max="form.to || undefined"
          />
        </UFormField>
        <UFormField
          name="to"
          :label="t('finance.screens.export.to')"
          required
          :error="refusal?.fields?.to ? refusal.reason : undefined"
        >
          <FieldDate
            v-model="form.to"
            :min="form.from || undefined"
          />
        </UFormField>
      </div>
      <UButton
        type="submit"
        icon="i-lucide-file-down"
        :loading="busy"
        :label="t('finance.screens.export.button')"
      />
    </UForm>
  </PageFrame>
</template>
