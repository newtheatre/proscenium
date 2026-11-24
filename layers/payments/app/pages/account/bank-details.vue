<!-- Bank details (P-A1): where the theatre pays a person back, such as an expense claim. Once saved
     they are never shown again, not even here: only the name's first letter and the last two digits. -->
<script setup lang="ts">
import { z } from 'zod'

interface Mine { payee: { held: boolean, initial: string | null, lastDigits: string | null, lastUsedOn: string | null } | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Mine>('/api/payments/payees/mine', { key: 'payments:payee:mine' })

// The same checks as the server's: spaces and hyphens are allowed and dropped.
const schema = z.object({
  accountName: z.string().trim().min(1, t('payments.screens.bank-details.name-needed')).max(70),
  sortCode: z.string().transform(v => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{6}$/, t('payments.screens.bank-details.sort-code-shape'))),
  accountNumber: z.string().transform(v => v.replace(/\s/g, '')).pipe(z.string().regex(/^\d{8}$/, t('payments.screens.bank-details.account-number-shape'))),
})
const form = reactive({ accountName: '', sortCode: '', accountNumber: '' })
const changing = ref(false)
const held = computed(() => data.value?.payee?.held === true)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function save() {
  refusal.value = null
  try {
    await $api('/api/payments/payees/mine', { method: 'PUT', body: { ...form } })
    Object.assign(form, { accountName: '', sortCode: '', accountNumber: '' })
    changing.value = false
    toast.add({ title: t('payments.screens.bank-details.saved'), color: 'success' })
    await refreshNuxtData('payments:payee:mine')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function remove() {
  const ok = await confirm({
    verb: t('payments.screens.bank-details.remove'),
    thing: t('payments.screens.bank-details.remove-thing'),
    consequence: t('payments.screens.bank-details.remove-consequence'),
    button: t('payments.screens.bank-details.remove'),
  })
  if (!ok) return
  try {
    await $api('/api/payments/payees/mine', { method: 'DELETE' })
    toast.add({ title: t('payments.screens.bank-details.removed'), color: 'success' })
    await refreshNuxtData('payments:payee:mine')
  }
  catch (e) {
    const r = toRefusal(e)
    toast.add({ title: r.reason, description: r.remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="t('payments.screens.bank-details.title')"
    :description="t('payments.screens.bank-details.help')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-6">
        <PageSection
          v-if="held && !changing"
          :title="t('payments.screens.bank-details.held-title')"
        >
          <p class="text-sm">
            {{ t('payments.screens.bank-details.masked', { initial: data?.payee?.initial ?? '', digits: data?.payee?.lastDigits ?? '' }) }}
          </p>
          <p class="text-sm text-muted mt-1">
            {{ t('payments.screens.bank-details.hidden') }}
          </p>
          <div class="flex gap-2 mt-4">
            <UButton
              :label="t('payments.screens.bank-details.change')"
              @click="changing = true"
            />
            <UButton
              color="neutral"
              variant="outline"
              :label="t('payments.screens.bank-details.remove')"
              @click="remove"
            />
          </div>
        </PageSection>
        <PageSection
          v-else
          :title="held ? t('payments.screens.bank-details.change-title') : t('payments.screens.bank-details.give-title')"
        >
          <UForm
            :schema="schema"
            :state="form"
            class="space-y-4"
            novalidate
            @submit="save"
          >
            <RefusalNotice :refusal="refusal" />
            <UFormField
              name="accountName"
              :label="t('payments.screens.bank-details.account-name')"
              :help="t('payments.screens.bank-details.account-name-help')"
              required
            >
              <UInput
                v-model="form.accountName"
                autocomplete="cc-name"
                maxlength="70"
              />
            </UFormField>
            <UFormField
              name="sortCode"
              :label="t('payments.screens.bank-details.sort-code')"
              required
            >
              <UInput
                v-model="form.sortCode"
                inputmode="numeric"
                autocomplete="off"
                placeholder="00-00-00"
                maxlength="10"
              />
            </UFormField>
            <UFormField
              name="accountNumber"
              :label="t('payments.screens.bank-details.account-number')"
              required
            >
              <UInput
                v-model="form.accountNumber"
                inputmode="numeric"
                autocomplete="off"
                maxlength="12"
              />
            </UFormField>
            <div class="flex gap-2">
              <UButton
                type="submit"
                loading-auto
                :label="t('payments.screens.bank-details.save')"
              />
              <UButton
                v-if="held"
                color="neutral"
                variant="ghost"
                :label="t('payments.screens.bank-details.keep')"
                @click="changing = false"
              />
            </div>
          </UForm>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
