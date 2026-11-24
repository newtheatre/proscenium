<!-- Spending categories: what money is spent on, each with the expense account its spending posts
     to. With no account it posts to Budgets' general expenses. Archived ones sit below a divider and
     stay on lines that already use them. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Category { id: string, name: string, description: string, accountId: string | null, archivedAt: number | null }
interface Account { id: string, code: string, name: string, systemKey: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { offer } = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], accounts: Account[], canManage: boolean }>('/api/budgets/categories', { key: 'budgets:categories' })
const live = computed(() => (data.value?.categories ?? []).filter(c => !c.archivedAt))
const archived = computed(() => (data.value?.categories ?? []).filter(c => c.archivedAt))
const generalAccount = computed(() => data.value?.accounts.find(a => a.systemKey === 'budgets.expenses'))
const accountItems = computed(() => (data.value?.accounts ?? []).filter(a => a.systemKey !== 'budgets.expenses').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })))
const accountName = (c: Category) => {
  const a = data.value?.accounts.find(x => x.id === c.accountId)
  return a ? `${a.code} ${a.name}` : t('budgets.screens.categories.general', { account: generalAccount.value?.name ?? '' })
}
const describe = (c: Category) => [c.description, accountName(c)].filter(Boolean).join(' · ')

const editing = ref<Category | null>(null)
const open = ref(false)
const form = reactive({ name: '', description: '', accountId: undefined as string | undefined })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
function start(c: Category | null) {
  editing.value = c
  Object.assign(form, { name: c?.name ?? '', description: c?.description ?? '', accountId: c?.accountId ?? undefined })
  refusal.value = null
  idempotency = crypto.randomUUID()
  open.value = true
}
async function save() {
  refusal.value = null
  const body = { name: form.name.trim(), description: form.description.trim(), accountId: form.accountId ?? null }
  try {
    if (editing.value) await $api(`/api/budgets/categories/${editing.value.id}` as string, { method: 'PATCH', body })
    else await $api('/api/budgets/categories', { method: 'POST', headers: { 'idempotency-key': idempotency }, body })
    open.value = false
    toast.add({ title: t('budgets.screens.categories.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setArchived(c: Category, value: boolean) {
  await $api(`/api/budgets/categories/${c.id}` as string, { method: 'PATCH', body: { archived: value } })
  await refresh()
}
async function archive(c: Category, value: boolean) {
  try {
    await setArchived(c, value)
    if (value) offer(t('budgets.screens.categories.archived-toast', { name: c.name }), () => setArchived(c, false))
  }
  catch (e) {
    const r = toRefusal(e)
    toast.add({ title: r.reason, description: r.remedy, color: 'error' })
  }
}
const actions = (c: Category): DropdownMenuItem[] => !data.value?.canManage
  ? []
  : [
      { label: t('budgets.screens.categories.edit'), icon: 'i-lucide-pencil', onSelect: () => start(c) },
      c.archivedAt
        ? { label: t('budgets.screens.categories.restore'), icon: 'i-lucide-archive-restore', onSelect: () => archive(c, false) }
        : { label: t('budgets.screens.categories.archive'), icon: 'i-lucide-archive', onSelect: () => archive(c, true) },
    ]
</script>

<template>
  <PageFrame
    :title="t('budgets.navigation.categories.label')"
    :description="t('budgets.screens.categories.help')"
  >
    <template #primary>
      <PageActions
        v-if="data?.canManage"
        :actions="[{ label: t('budgets.screens.categories.new'), icon: 'i-lucide-plus', onSelect: () => start(null) }]"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.categories.length"
        icon="i-lucide-tags"
        :title="t('budgets.screens.categories.empty')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList :label="t('budgets.navigation.categories.label')">
          <RecordListItem
            v-for="c in live"
            :key="c.id"
            icon="i-lucide-tag"
            :name="c.name"
            :description="describe(c)"
          >
            <RowActions
              :items="actions(c)"
              :label="t('budgets.screens.categories.actions', { name: c.name })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('budgets.screens.categories.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('budgets.screens.categories.archived')">
            <RecordListItem
              v-for="c in archived"
              :key="c.id"
              icon="i-lucide-tag"
              :name="c.name"
              :description="describe(c)"
              muted
            >
              <RowActions
                :items="actions(c)"
                :label="t('budgets.screens.categories.actions', { name: c.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <UModal
      v-model:open="open"
      :title="t(editing ? 'budgets.screens.categories.edit' : 'budgets.screens.categories.new')"
    >
      <template #body>
        <UForm
          id="budgets-category"
          ref="formEl"
          :state="form"
          :validate="() => needs({ name: form.name })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('budgets.screens.categories.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField
            name="description"
            :label="t('budgets.screens.categories.description')"
          >
            <UInput
              v-model="form.description"
              maxlength="300"
            />
          </UFormField>
          <UFormField
            name="accountId"
            :label="t('budgets.screens.categories.account')"
            :help="t('budgets.screens.categories.account-help')"
          >
            <USelectMenu
              v-model="form.accountId"
              value-key="value"
              :items="accountItems"
              :placeholder="t('budgets.screens.categories.general', { account: generalAccount?.name ?? '' })"
              clear
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-category"
          :loading="formEl?.loading"
          :label="t('budgets.screens.line.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
