<!-- Accounts (Box office specification, part 5): the chart of accounts with each account's balance.
     Rename and recode any account to match the theatre's accounting package; an account a module
     declared cannot be retired. An added account is given to one module, which alone posts to it. -->
<script setup lang="ts">
type Kind = 'asset' | 'liability' | 'income' | 'expense' | 'equity'
interface Account { id: string, code: string, name: string, kind: Kind, module: string, scope: string | null, active: boolean, locked: boolean, balances: { currency: string, balanceMinor: number }[] }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ modules: string[], accounts: Account[] }>('/api/finance/accounts', { key: 'finance:accounts' })

const KINDS: Kind[] = ['asset', 'liability', 'income', 'expense', 'equity']
const moduleLabel = (id: string) => (te(`${id}.module.name`) ? t(`${id}.module.name`) : id)
const byKind = computed(() => KINDS.map(kind => ({ kind, accounts: (data.value?.accounts ?? []).filter(a => a.kind === kind) })).filter(g => g.accounts.length))

// One form for adding and for changing: changing leaves kind and module as they are.
const editing = ref<Account | null>(null)
const open = ref(false)
const form = reactive({ code: '', name: '', kind: 'income' as Kind, module: '', active: true, key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
function openAdd() {
  editing.value = null
  Object.assign(form, { code: '', name: '', kind: 'income', module: '', active: true, key: crypto.randomUUID() })
  refusal.value = null
  open.value = true
}
function openEdit(a: Account) {
  editing.value = a
  Object.assign(form, { code: a.code, name: a.name, kind: a.kind, module: a.module, active: a.active })
  refusal.value = null
  open.value = true
}
async function save() {
  busy.value = true
  refusal.value = null
  try {
    if (editing.value) {
      await $api(`/api/finance/accounts/${editing.value.id}` as string, { method: 'PATCH', body: { code: form.code, name: form.name, active: editing.value.locked ? undefined : form.active } })
    }
    else {
      await $api('/api/finance/accounts', { method: 'POST', body: { code: form.code, name: form.name, kind: form.kind, module: form.module }, headers: { 'idempotency-key': form.key } })
    }
    open.value = false
    toast.add({ title: t(editing.value ? 'finance.screens.accounts.saved' : 'finance.screens.accounts.added'), color: 'success' })
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
    :title="t('finance.navigation.accounts.label')"
    :description="t('finance.screens.accounts.help')"
  >
    <template #primary>
      <UButton
        :label="t('finance.screens.accounts.add')"
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
      <div class="space-y-6">
        <PageSection
          v-for="g in byKind"
          :key="g.kind"
          :title="t(`finance.screens.accounts.kinds.${g.kind}`)"
        >
          <RecordList :label="t(`finance.screens.accounts.kinds.${g.kind}`)">
            <RecordListItem
              v-for="a in g.accounts"
              :key="a.id"
              :description="a.scope ? `${moduleLabel(a.module)} · ${a.scope}` : moduleLabel(a.module)"
              :muted="!a.active"
            >
              <template #name>
                <span class="font-mono text-muted">{{ a.code }}</span> {{ a.name }}
              </template>
              <StatusBadge
                v-if="!a.active"
                tone="neutral"
                :label="t('finance.screens.accounts.retired')"
              />
              <span class="text-right tabular-nums">
                <span
                  v-for="b in a.balances"
                  :key="b.currency"
                  class="block"
                >{{ money(b.balanceMinor, b.currency) }}</span>
              </span>
              <IconButton
                icon="i-lucide-pencil"
                :label="t('finance.screens.accounts.edit-label', { account: a.name })"
                size="sm"
                @click="openEdit(a)"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="editing ? t('finance.screens.accounts.edit-title', { account: editing.name }) : t('finance.screens.accounts.add')"
    >
      <template #body>
        <UForm
          id="ledger-account"
          :state="form"
          :validate="() => needs({ code: form.code, name: form.name, module: editing ? true : form.module })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              name="code"
              :label="t('finance.screens.accounts.code')"
              :help="t('finance.screens.accounts.code-help')"
              required
              :error="refusal?.fields?.code || refusal?.code === 'finance.account.code-taken' ? refusal.reason : undefined"
            >
              <UInput
                v-model="form.code"
                maxlength="40"
                class="font-mono"
              />
            </UFormField>
            <UFormField
              name="name"
              :label="t('finance.screens.accounts.name')"
              required
              class="sm:col-span-2"
            >
              <UInput
                v-model="form.name"
                maxlength="80"
              />
            </UFormField>
          </div>
          <template v-if="!editing">
            <UFormField
              :label="t('finance.screens.accounts.kind')"
              required
            >
              <USelect
                v-model="form.kind"
                :items="KINDS.map(k => ({ value: k, label: t(`finance.screens.accounts.kinds.${k}`) }))"
              />
            </UFormField>
            <UFormField
              name="module"
              :label="t('finance.screens.accounts.module')"
              :help="t('finance.screens.accounts.module-help')"
              required
              :error="refusal?.fields?.module ? refusal.reason : undefined"
            >
              <USelect
                v-model="form.module"
                :items="(data?.modules ?? []).map(m => ({ value: m, label: moduleLabel(m) }))"
              />
            </UFormField>
          </template>
          <USwitch
            v-else-if="!editing.locked"
            v-model="form.active"
            :label="t('finance.screens.accounts.in-use')"
            :description="t('finance.screens.accounts.in-use-help')"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ t('finance.screens.accounts.locked') }}
          </p>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="ledger-account"
          :loading="busy"
          :label="editing ? t('finance.screens.accounts.save') : t('finance.screens.accounts.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
