<!-- Tax codes (F-A2): the VAT rates prices, invoices and bills carry once the theatre is registered.
     A code's rate is fixed once the ledger uses it, so a change of rate is a new code and the old one
     stops being offered. -->
<script setup lang="ts">
interface TaxCode { code: string, label: string, rateBasisPoints: number, active: boolean, inScope: boolean, used: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ codes: TaxCode[] }>('/api/finance/tax-codes', { key: 'finance:tax-codes' })

const { language } = useDates()
const percent = (bp: number) => new Intl.NumberFormat(language.value, { style: 'percent', maximumFractionDigits: 2 }).format(bp / 10000) // not-policy: basis points to a fraction

const editing = ref<TaxCode | null>(null)
const open = ref(false)
const form = reactive({ code: '', label: '', rate: 0, inScope: true, active: true, key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
function openAdd() {
  editing.value = null
  Object.assign(form, { code: '', label: '', rate: 0, inScope: true, active: true, key: crypto.randomUUID() })
  refusal.value = null
  open.value = true
}
function openEdit(c: TaxCode) {
  editing.value = c
  Object.assign(form, { code: c.code, label: c.label, rate: c.rateBasisPoints / 100, inScope: c.inScope, active: c.active })
  refusal.value = null
  open.value = true
}
async function save() {
  busy.value = true
  refusal.value = null
  const rateBasisPoints = Math.round(form.rate * 100)
  try {
    if (editing.value) {
      const fixed = editing.value.used
      await $api(`/api/finance/tax-codes/${editing.value.code}` as string, { method: 'PATCH', body: {
        label: form.label,
        rateBasisPoints: fixed ? undefined : rateBasisPoints,
        inScope: fixed ? undefined : form.inScope,
        active: editing.value.code === 'none' ? undefined : form.active,
      } })
    }
    else {
      await $api('/api/finance/tax-codes', { method: 'POST', body: { code: form.code, label: form.label, rateBasisPoints, inScope: form.inScope }, headers: { 'idempotency-key': form.key } })
    }
    open.value = false
    toast.add({ title: t(editing.value ? 'finance.screens.tax-codes.saved' : 'finance.screens.tax-codes.added'), color: 'success' })
    await refresh()
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
    :title="t('finance.navigation.tax-codes.label')"
    :description="t('finance.screens.tax-codes.help')"
  >
    <template #primary>
      <UButton
        :label="t('finance.screens.tax-codes.add')"
        icon="i-lucide-plus"
        @click="openAdd"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <RecordList :label="t('finance.navigation.tax-codes.label')">
        <RecordListItem
          v-for="c in data?.codes ?? []"
          :key="c.code"
          :muted="!c.active"
        >
          <template #name>
            <span class="flex items-baseline justify-between gap-3">
              <span>{{ c.label }}</span>
              <span class="shrink-0 tabular-nums">{{ percent(c.rateBasisPoints) }}</span>
            </span>
          </template>
          <template #description>
            <span class="font-mono">{{ c.code }}</span>
            <template v-if="!c.inScope">
              · {{ t('finance.screens.tax-codes.out-of-scope') }}
            </template>
          </template>
          <StatusBadge
            v-if="!c.active"
            tone="neutral"
            :label="t('finance.screens.tax-codes.stopped')"
          />
          <IconButton
            icon="i-lucide-pencil"
            :label="t('finance.screens.tax-codes.edit-label', { code: c.label })"
            size="sm"
            @click="openEdit(c)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="editing ? t('finance.screens.tax-codes.edit-title', { code: editing.label }) : t('finance.screens.tax-codes.add')"
    >
      <template #body>
        <UForm
          id="tax-code"
          :state="form"
          :validate="() => needs({ code: editing ? true : form.code, label: form.label })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              v-if="!editing"
              name="code"
              :label="t('finance.screens.tax-codes.code')"
              :help="t('finance.screens.tax-codes.code-help')"
              required
              :error="refusal?.code === 'finance.tax-code.taken' ? refusal.reason : undefined"
            >
              <UInput
                v-model="form.code"
                maxlength="30"
                class="font-mono"
              />
            </UFormField>
            <UFormField
              name="label"
              :label="t('finance.screens.tax-codes.label')"
              required
              :class="editing ? 'sm:col-span-3' : 'sm:col-span-2'"
            >
              <UInput
                v-model="form.label"
                maxlength="60"
              />
            </UFormField>
          </div>
          <UFormField
            name="rateBasisPoints"
            :label="t('finance.screens.tax-codes.rate')"
            :help="editing?.used ? t('finance.screens.tax-codes.rate-fixed') : t('finance.screens.tax-codes.rate-help')"
            :error="refusal?.fields?.rateBasisPoints ? refusal.reason : undefined"
          >
            <FieldNumber
              v-model="form.rate"
              :min="0"
              :max="100"
              :step="0.01"
              :format-options="{ maximumFractionDigits: 2 }"
              :disabled="!!editing?.used"
            />
          </UFormField>
          <USwitch
            v-model="form.inScope"
            :disabled="!!editing?.used"
            :label="t('finance.screens.tax-codes.in-scope')"
            :description="t('finance.screens.tax-codes.in-scope-help')"
          />
          <USwitch
            v-if="editing && editing.code !== 'none'"
            v-model="form.active"
            :label="t('finance.screens.tax-codes.active')"
            :description="t('finance.screens.tax-codes.active-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="tax-code"
          :loading="busy"
          :label="editing ? t('finance.screens.tax-codes.save') : t('finance.screens.tax-codes.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
