<!-- A new budget: what it is for (a production, a department and year, a season, or a general
     purpose) and, under "More details", the line of a larger budget it is funded from. -->
<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [budgetId: string] }>()

interface Option { id: string, label: string }
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const text = useBudgetText()
const { data: options, refresh } = await useAPI<{ productions: Option[], seasons: Option[], departments: Option[], parentLines: (Option & { budget: string })[], years: string[] }>('/api/budgets/budgets/new', { key: 'budgets:new', immediate: false })
const SCOPES = ['production', 'department', 'season', 'general'] as const
const blank = () => ({ scope: 'production' as typeof SCOPES[number], productionId: undefined as string | undefined, seasonId: undefined as string | undefined, departmentTermId: undefined as string | undefined, year: undefined as string | undefined, name: '', parentLineId: undefined as string | undefined })
const form = reactive(blank())
const more = ref(false)
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
watch(open, async (now) => {
  if (!now) return
  Object.assign(form, blank())
  more.value = false
  refusal.value = null
  idempotency = crypto.randomUUID()
  await refresh()
  form.year = options.value?.years[0]
})
const scopes = computed(() => SCOPES.map(s => ({ value: s, label: t(`budgets.screens.scopes.${s}`) })))
const items = (list: Option[] | undefined) => (list ?? []).map(o => ({ value: o.id, label: o.label }))
const years = computed(() => (options.value?.years ?? []).map(y => ({ value: y, label: text.year(y) })))
const parents = computed(() => (options.value?.parentLines ?? []).map(o => ({ value: o.id, label: `${o.budget}: ${o.label}` })))
const check = () => needs({
  productionId: form.scope === 'production' ? form.productionId : true,
  seasonId: form.scope === 'season' ? form.seasonId : true,
  departmentTermId: form.scope === 'department' ? form.departmentTermId : true,
  name: form.scope === 'general' ? form.name : true,
})

async function create() {
  refusal.value = null
  try {
    const made = await $api<{ budgetId: string }>('/api/budgets/budgets', {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: {
        scope: form.scope,
        productionId: form.scope === 'production' ? form.productionId : undefined,
        seasonId: form.scope === 'season' ? form.seasonId : undefined,
        departmentTermId: form.scope === 'department' ? form.departmentTermId : undefined,
        year: form.scope === 'department' || form.scope === 'general' ? form.year : undefined,
        name: form.name.trim() || undefined,
        parentLineId: form.parentLineId ?? null,
      },
    })
    open.value = false
    await refreshNuxtData('budgets:list')
    emit('created', made.budgetId)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('budgets.screens.new.title')"
    :description="t('budgets.screens.new.help')"
  >
    <template #body>
      <UForm
        id="budgets-new"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="create"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="scope"
          :label="t('budgets.screens.new.scope')"
          required
        >
          <USelect
            v-model="form.scope"
            :items="scopes"
          />
        </UFormField>
        <UFormField
          v-if="form.scope === 'production'"
          name="productionId"
          :label="t('budgets.screens.scopes.production')"
          :help="t('budgets.screens.new.production-help')"
          required
        >
          <USelectMenu
            v-model="form.productionId"
            value-key="value"
            :items="items(options?.productions)"
          />
        </UFormField>
        <UFormField
          v-if="form.scope === 'season'"
          name="seasonId"
          :label="t('budgets.screens.scopes.season')"
          required
        >
          <USelectMenu
            v-model="form.seasonId"
            value-key="value"
            :items="items(options?.seasons)"
          />
        </UFormField>
        <UFormField
          v-if="form.scope === 'department'"
          name="departmentTermId"
          :label="t('budgets.screens.scopes.department')"
          required
        >
          <USelect
            v-model="form.departmentTermId"
            :items="items(options?.departments)"
          />
        </UFormField>
        <UFormField
          v-if="form.scope === 'department' || form.scope === 'general'"
          name="year"
          :label="t('budgets.screens.new.year')"
          required
        >
          <USelect
            v-model="form.year"
            :items="years"
          />
        </UFormField>
        <UFormField
          name="name"
          :label="t('budgets.screens.new.name')"
          :help="form.scope === 'general' ? undefined : t('budgets.screens.new.name-help')"
          :required="form.scope === 'general'"
        >
          <UInput
            v-model="form.name"
            maxlength="80"
          />
        </UFormField>
        <UCollapsible v-model:open="more">
          <UButton
            color="neutral"
            variant="link"
            class="px-0"
            :trailing-icon="more ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="t('budgets.screens.new.more')"
          />
          <template #content>
            <UFormField
              name="parentLineId"
              :label="t('budgets.screens.new.parent')"
              :help="t('budgets.screens.new.parent-help')"
              class="pt-2"
            >
              <USelectMenu
                v-model="form.parentLineId"
                value-key="value"
                :items="parents"
                clear
              />
            </UFormField>
          </template>
        </UCollapsible>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="budgets-new"
        :loading="formEl?.loading"
        :label="t('budgets.screens.new.create')"
      />
    </template>
  </UModal>
</template>
