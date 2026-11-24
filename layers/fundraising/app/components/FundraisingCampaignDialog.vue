<!-- A new campaign, or a change to one (FR-10, screen C6): its page (title, address, summary and
     text), the fund its gifts go to, the show it is for, its target and times, and what its page
     shows. The address follows the title until it is typed. A fund that has received gifts stays. -->
<script setup lang="ts">
import type { Campaign } from '../composables/useCampaignText'

/** undefined: closed; null: a new campaign. */
const props = defineProps<{ campaign: Campaign | null | undefined, funds: { id: string, name: string }[] }>()
const emit = defineEmits<{ close: [], saved: [id: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const formEl = useFormRef('formEl')
const blank = () => ({
  title: '', slug: '', summary: '', body: '', fundId: props.funds[0]?.id ?? '', productionId: null as string | null,
  targetMinor: null as number | null, offsetMinor: 0 as number | null, offsetNote: '', opensAt: Date.now() as number | null, closesAt: null as number | null,
  showTotal: true, countGiftAid: false, listNames: false, listAmounts: 'none' as Campaign['listAmounts'],
})
const form = reactive(blank())
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const open = computed({ get: () => props.campaign !== undefined, set: (v) => { if (!v) emit('close') } })
const slugTyped = ref(false)
let idempotency = ''
watch(() => props.campaign, (c) => {
  if (c === undefined) return
  Object.assign(form, blank(), c ? { ...c, body: c.body ?? '', offsetNote: c.offsetNote ?? '' } : {})
  slugTyped.value = !!c
  refusal.value = null
  idempotency = crypto.randomUUID()
})
const toSlug = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) // not-policy: the address's bound
watch(() => form.title, (title) => {
  if (!slugTyped.value) form.slug = toSlug(title)
})
const amountItems = computed(() => (['none', 'band', 'exact'] as const).map(value => ({ value, label: t(`fundraising.campaign.list-amounts.${value}`) })))
const fundItems = computed(() => props.funds.map(f => ({ value: f.id, label: f.name })))

function validate() {
  const errors = needs({ title: form.title, slug: form.slug, summary: form.summary, fundId: form.fundId, opensAt: form.opensAt })
  if (form.closesAt && form.opensAt && form.closesAt <= form.opensAt) errors.push({ name: 'closesAt', message: t('fundraising.campaign.closes-first') })
  if (form.offsetMinor && !form.offsetNote.trim()) errors.push({ name: 'offsetNote', message: t('fundraising.campaign.offset-note') })
  return errors
}

async function save() {
  refusal.value = null
  const body = {
    title: form.title.trim(), slug: form.slug.trim(), summary: form.summary.trim(), body: form.body.trim() || null, fundId: form.fundId,
    productionId: form.productionId, targetMinor: form.targetMinor || null, offsetMinor: form.offsetMinor ?? 0, offsetNote: form.offsetNote.trim() || null,
    opensAt: form.opensAt, closesAt: form.closesAt, showTotal: form.showTotal, countGiftAid: form.countGiftAid, listNames: form.listNames, listAmounts: form.listAmounts,
  }
  try {
    const saved = props.campaign
      ? await $api<{ campaignId: string }>(`/api/fundraising/campaigns/${props.campaign.id}` as string, { method: 'PATCH', body })
      : await $api<{ campaignId: string }>('/api/fundraising/campaigns', { method: 'POST', headers: { 'idempotency-key': idempotency }, body })
    toast.add({ title: t('fundraising.campaign.saved'), color: 'success' })
    emit('saved', saved.campaignId)
    emit('close')
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
    :title="t(campaign ? 'fundraising.campaign.edit' : 'fundraising.campaign.new')"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="fundraising-campaign"
        ref="formEl"
        :state="form"
        :validate="validate"
        class="space-y-6"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <FieldGroup :title="t('fundraising.campaign.page')">
          <UFormField
            name="title"
            :label="t('fundraising.campaign.title')"
            required
          >
            <UInput
              v-model="form.title"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="slug"
            :label="t('fundraising.campaign.slug')"
            :help="t('fundraising.campaign.slug-help', { slug: form.slug || '…' })"
            required
          >
            <UInput
              v-model="form.slug"
              maxlength="80"
              @input="slugTyped = true"
            />
          </UFormField>
          <UFormField
            name="summary"
            :label="t('fundraising.campaign.summary')"
            :help="t('fundraising.campaign.summary-help')"
            required
          >
            <UTextarea
              v-model="form.summary"
              maxlength="200"
              :rows="2"
            />
          </UFormField>
          <UFormField
            name="body"
            :label="t('fundraising.campaign.body')"
            :help="t('fundraising.campaign.body-help')"
          >
            <UTextarea
              v-model="form.body"
              :rows="6"
            />
          </UFormField>
        </FieldGroup>
        <FieldGroup :title="t('fundraising.campaign.money')">
          <UFormField
            name="fundId"
            :label="t('fundraising.campaign.fund')"
            :help="campaign?.received ? t('fundraising.campaign.fund-fixed') : t('fundraising.campaign.fund-help')"
            required
          >
            <USelect
              v-model="form.fundId"
              :items="fundItems"
              :disabled="campaign?.received"
            />
          </UFormField>
          <UFormField
            name="productionId"
            :label="t('fundraising.campaign.production')"
            :help="t('fundraising.campaign.production-help')"
          >
            <FieldRecord
              v-model="form.productionId"
              record="core.production"
            />
          </UFormField>
          <UFormField
            name="targetMinor"
            :label="t('fundraising.campaign.target')"
            :help="t('fundraising.campaign.target-help')"
          >
            <FieldMoney
              v-model="form.targetMinor"
              :min="1"
            />
          </UFormField>
          <FundraisingCampaignOffset
            v-model:amount="form.offsetMinor"
            v-model:note="form.offsetNote"
          />
        </FieldGroup>
        <FundraisingCampaignShows
          v-model:opens-at="form.opensAt"
          v-model:closes-at="form.closesAt"
          v-model:show-total="form.showTotal"
          v-model:count-gift-aid="form.countGiftAid"
          v-model:list-names="form.listNames"
          v-model:list-amounts="form.listAmounts"
          :amount-items="amountItems"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="fundraising-campaign"
        :loading="formEl?.loading"
        :label="t('fundraising.campaign.save')"
      />
    </template>
  </UModal>
</template>
