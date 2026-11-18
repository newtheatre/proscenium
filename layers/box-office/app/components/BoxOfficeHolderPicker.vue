<!-- Who one ticket of a member or holder price is for, at the till (Matt, 17 November): the seller
     scans the holder's card, such as a membership card, or finds them by name, and is told at once
     whether they qualify. Where they do not, a seller who may check by hand can sell it to them
     anyway; nobody is sold one without being named. The sale checks everything again. For a ticket
     that needs the access scheme, such as a wheelchair space, somebody who has never applied can
     have the application filled in with them here; once sent, it is enough to sell them one. A
     companion ticket is named for the person on the access scheme it goes with (Matt, 18 November),
     so the words ask for them, not the companion. -->
<script setup lang="ts">
import type { Buyer } from './BoxOfficeBuyerPicker.vue'

export interface Holder { accountId: string, label: string, byHand: boolean }
interface Answer { accountId: string, label: string, met: boolean, reason: string | null, mayOverride: boolean, mayApply: boolean }

const props = defineProps<{ performanceId: string, ticketTypeId: string, label: string, companion?: boolean, disabled?: boolean }>()
const model = defineModel<Holder | undefined>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const picked = ref<Buyer | undefined>()
const answer = ref<Answer | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)

async function ask(by: { code: string } | { accountId: string }) {
  busy.value = true
  error.value = null
  answer.value = null
  try {
    const found = await $api<Answer>('/api/box-office/desk/holder', { method: 'POST', body: { performanceId: props.performanceId, ticketTypeId: props.ticketTypeId, ...by } })
    if (found.met) model.value = { accountId: found.accountId, label: found.label, byHand: false }
    else answer.value = found
  }
  catch (e) {
    error.value = toRefusal(e).reason
  }
  finally {
    busy.value = false
    picked.value = undefined
  }
}
watch(picked, (buyer) => {
  if (!buyer) return
  if ('accountId' in buyer) void ask({ accountId: buyer.accountId })
  else {
    error.value = t('box-office.screens.panel.holder.by-name')
    picked.value = undefined
  }
})
function byHand() {
  if (!answer.value) return
  model.value = { accountId: answer.value.accountId, label: answer.value.label, byHand: true }
  answer.value = null
}
// Applying to the access scheme with them, then asking again: a sent application is enough.
const applying = ref(false)
const applyFor = ref<string | null>(null)
function startApplying() {
  if (!answer.value) return
  applyFor.value = answer.value.accountId
  applying.value = true
}
async function applied() {
  if (applyFor.value) await ask({ accountId: applyFor.value })
}
const actions = computed(() => {
  const a = answer.value
  if (!a) return undefined
  const list = [
    ...(a.mayApply ? [{ label: t('box-office.screens.panel.access.start', { name: a.label }), color: 'neutral' as const, variant: 'outline' as const, icon: 'i-lucide-accessibility', onClick: startApplying }] : []),
    ...(a.mayOverride ? [{ label: t('box-office.screens.panel.holder.sell-anyway', { name: a.label }), color: 'neutral' as const, variant: 'outline' as const, onClick: byHand }] : []),
  ]
  return list.length ? list : undefined
})
function change() {
  model.value = undefined
  answer.value = null
  error.value = null
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="model"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated px-3 py-1.5 text-sm"
    >
      <UIcon
        :name="model.byHand ? 'i-lucide-hand' : 'i-lucide-badge-check'"
        class="size-4 shrink-0"
        :class="model.byHand ? 'text-warning' : 'text-success'"
      />
      <span class="flex-1">
        {{ t(model.byHand ? 'box-office.screens.panel.holder.by-hand' : 'box-office.screens.panel.holder.named', { label, name: model.label }) }}
      </span>
      <UButton
        size="sm"
        color="neutral"
        variant="link"
        :label="t('box-office.screens.panel.holder.change')"
        :disabled="disabled"
        @click="change"
      />
    </div>
    <UFormField
      v-else
      :label="label"
      :error="error ?? undefined"
    >
      <div class="flex items-center gap-2">
        <BoxOfficeBuyerPicker
          v-model="picked"
          :domains="[]"
          :placeholder="t(companion ? 'box-office.screens.panel.holder.companion-placeholder' : 'box-office.screens.panel.holder.placeholder')"
          :disabled="disabled || busy"
          class="min-w-0 flex-1"
        />
        <CodeScanButton
          icon-only
          :disabled="disabled || busy"
          @scanned="(code: string) => ask({ code })"
        />
      </div>
    </UFormField>
    <UAlert
      v-if="answer"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t(companion ? 'box-office.screens.panel.holder.companion-not-met' : 'box-office.screens.panel.holder.not-met', { name: answer.label })"
      :description="answer.reason ?? undefined"
      :actions="actions"
    />
    <BoxOfficeAccessApply
      v-if="applyFor"
      v-model:open="applying"
      :performance-id="performanceId"
      :account-id="applyFor"
      @applied="applied"
    />
  </div>
</template>
