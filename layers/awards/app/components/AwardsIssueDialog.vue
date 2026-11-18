<!-- Issue an award: records one the committee has decided. The recipient is somebody already
     known, a new person by name and address, or a name alone for a historical award, which is listed
     and gives no ticket price until an account is linked. The date starts as today, and empty for a name alone, which is dated by hand; the show it is
     for and the committee's decision are under "More details". -->
<script setup lang="ts">
const props = defineProps<{ types: { id: string, name: string }[], typeId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ issued: [awardId: string] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { toLocal } = useDates()
const today = () => toLocal(Date.now()).slice(0, 10) // not-policy: the length of a date, 2027-09-01
const blank = () => ({ typeId: props.typeId ?? props.types[0]?.id ?? '', who: 'person' as 'person' | 'new' | 'name', accountId: undefined as string | undefined, recipientName: '', address: '', awardedOn: today(), awardedFor: '', citation: '', productionId: null as string | null, decidedOn: '', decisionNote: '' })
const form = reactive(blank())
const more = ref(false)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
// A past award recorded by name alone is dated by hand: today's date would be invented for it.
watch(() => form.who, (now, before) => {
  if (now === 'name') form.awardedOn = ''
  else if (before === 'name' && !form.awardedOn) form.awardedOn = today()
})
watch(open, (now) => {
  if (!now) return
  Object.assign(form, blank())
  more.value = false
  refusal.value = null
  idempotency = crypto.randomUUID()
})
const whoItems = computed(() => (['person', 'new', 'name'] as const).map(v => ({ value: v, label: t(`awards.screens.issue.who-${v}`), description: t(`awards.screens.issue.who-${v}-help`) })))
const check = () => needs({
  typeId: form.typeId,
  awardedOn: form.awardedOn,
  accountId: form.who === 'person' ? form.accountId : true,
  recipientName: form.who === 'person' ? true : form.recipientName,
  address: form.who === 'new' ? form.address : true,
})

async function issue() {
  refusal.value = null
  try {
    const made = await $api<{ awardId: string }>(`/api/awards/types/${form.typeId}/awards` as string, {
      method: 'POST',
      headers: { 'idempotency-key': idempotency },
      body: {
        accountId: form.who === 'person' ? form.accountId : undefined,
        recipientName: form.recipientName.trim() || undefined,
        address: form.who === 'new' ? form.address.trim() : undefined,
        awardedOn: form.awardedOn,
        awardedFor: form.awardedFor.trim() || null,
        citation: form.citation.trim() || null,
        productionId: form.productionId,
        decidedOn: form.decidedOn || null,
        decisionNote: form.decisionNote.trim() || null,
      },
    })
    open.value = false
    await refreshNuxtData(['awards:list', 'awards:types'])
    emit('issued', made.awardId)
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
    :title="t('awards.screens.issue.title')"
    :description="t('awards.screens.issue.help')"
  >
    <template #body>
      <UForm
        id="awards-issue"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="issue"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="typeId"
          :label="t('awards.screens.issue.type')"
          required
        >
          <USelect
            v-model="form.typeId"
            :items="types.map(x => ({ value: x.id, label: x.name }))"
          />
        </UFormField>
        <UFormField
          name="who"
          :label="t('awards.screens.issue.who')"
          required
        >
          <URadioGroup
            v-model="form.who"
            :items="whoItems"
          />
        </UFormField>
        <UFormField
          v-if="form.who === 'person'"
          name="accountId"
          :label="t('awards.screens.issue.person')"
          required
        >
          <PersonPicker v-model="form.accountId" />
        </UFormField>
        <UFormField
          name="recipientName"
          :label="t('awards.screens.issue.name')"
          :help="t(form.who === 'person' ? 'awards.screens.issue.name-help-person' : 'awards.screens.issue.name-help')"
          :required="form.who !== 'person'"
        >
          <UInput
            v-model="form.recipientName"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          v-if="form.who === 'new'"
          name="address"
          :label="t('awards.screens.issue.address')"
          :help="t('awards.screens.issue.address-help')"
          required
        >
          <UInput
            v-model="form.address"
            type="email"
            maxlength="254"
          />
        </UFormField>
        <UFormField
          name="awardedOn"
          :label="t('awards.screens.award.awarded-on')"
          required
        >
          <FieldDate v-model="form.awardedOn" />
        </UFormField>
        <UFormField
          name="awardedFor"
          :label="t('awards.screens.award.awarded-for')"
          :help="t('awards.screens.award.awarded-for-help')"
        >
          <UInput
            v-model="form.awardedFor"
            maxlength="200"
          />
        </UFormField>
        <UFormField
          name="citation"
          :label="t('awards.screens.award.citation')"
          :help="t('awards.screens.award.citation-help')"
        >
          <UTextarea
            v-model="form.citation"
            :rows="3"
            maxlength="2000"
          />
        </UFormField>
        <UCollapsible v-model:open="more">
          <UButton
            color="neutral"
            variant="link"
            :icon="more ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            :label="t('awards.screens.issue.more')"
            class="px-0"
          />
          <template #content>
            <div class="space-y-4 pt-4">
              <AwardsDecisionFields
                v-model:production-id="form.productionId"
                v-model:decided-on="form.decidedOn"
                v-model:decision-note="form.decisionNote"
              />
            </div>
          </template>
        </UCollapsible>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="awards-issue"
        loading-auto
        :label="t('awards.screens.issue.submit')"
      />
    </template>
  </UModal>
</template>
