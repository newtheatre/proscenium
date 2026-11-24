<!-- What the seller adds to the whole till sale (the unified promotions design): codes the customer
     gives, and discounts picked from the till's list, each with its reason where one is asked for. One
     box takes both; each is tried against the sale before it is added, so a code that cannot be used
     says why under the box. Each added one is a badge that takes it off again, with an undo. -->
<script setup lang="ts">
import type { Choice, Pricing } from '../../shared/till'

const props = defineProps<{
  pricing: Pricing
  /** Prices the sale with `next`, and keeps it; throws the server's refusal where it cannot be used. */
  price: (next: Pricing) => Promise<void>
}>()
const emit = defineEmits<{ 'update:pricing': [Pricing] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

const codeTyped = ref('')
const picked = ref<string | undefined>(undefined)
const reason = ref('')
const choices = ref<Choice[] | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const trying = ref(false)
const pickedChoice = computed(() => choices.value?.find(c => c.promotionId === picked.value))
const choiceItems = computed<{ type?: 'label', value?: string, label: string, icon?: string }[]>(() => choices.value?.length
  ? [{ type: 'label', label: t('payments.screens.till.discount-list') }, ...choices.value.map(c => ({ value: c.promotionId, label: c.name, icon: 'i-lucide-badge-percent' }))]
  : [])

async function loadChoices() {
  if (choices.value) return
  try { choices.value = (await $api<{ choices: Choice[] }>('/api/payments/till/discounts')).choices }
  catch { choices.value = [] }
}
function clearBox() {
  codeTyped.value = ''
  picked.value = undefined
  reason.value = ''
  refusal.value = null
}
async function tryAdding(next: Pricing) {
  trying.value = true
  refusal.value = null
  try {
    await props.price(next)
    clearBox()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    trying.value = false
  }
}
function addCode(typed?: string) {
  const code = (typed ?? codeTyped.value).trim()
  if (!code) return
  picked.value = undefined
  void tryAdding({ codes: [...props.pricing.codes.filter(c => c.toUpperCase() !== code.toUpperCase()), code], staff: props.pricing.staff })
}
function addPicked() {
  const choice = pickedChoice.value
  const why = reason.value.trim()
  if (!choice || (choice.needsReason && !why)) return
  void tryAdding({ codes: props.pricing.codes, staff: [...props.pricing.staff.filter(s => s.promotionId !== choice.promotionId), { promotionId: choice.promotionId, label: choice.label, ...(why ? { reason: why } : {}) }] })
}
// A discount that asks for a reason waits for one; any other is given as soon as it is picked.
watch(picked, () => {
  refusal.value = null
  reason.value = ''
  if (pickedChoice.value && !pickedChoice.value.needsReason) addPicked()
})

function remove(label: string, next: Pricing) {
  const before = { codes: [...props.pricing.codes], staff: [...props.pricing.staff] }
  emit('update:pricing', next)
  toast.add({ id: 'payments-till', title: t('payments.screens.till.discount-removed', { name: label }), color: 'neutral', actions: [{ label: t('payments.screens.till.undo'), color: 'neutral', variant: 'outline', onClick: () => emit('update:pricing', before) }] })
}
const added = computed(() => [
  ...props.pricing.codes.map(code => ({ key: `code:${code}`, label: code.toUpperCase(), remove: () => remove(code.toUpperCase(), { codes: props.pricing.codes.filter(c => c !== code), staff: props.pricing.staff }) })),
  ...props.pricing.staff.map(s => ({ key: `staff:${s.promotionId}`, label: s.label, remove: () => remove(s.label, { codes: props.pricing.codes, staff: props.pricing.staff.filter(x => x.promotionId !== s.promotionId) }) })),
])
</script>

<template>
  <div
    v-if="added.length"
    class="flex flex-wrap items-center gap-2"
  >
    <UBadge
      v-for="d in added"
      :key="d.key"
      color="neutral"
      variant="subtle"
      size="lg"
      class="gap-1"
    >
      {{ d.label }}
      <IconButton
        icon="i-lucide-x"
        :label="t('payments.screens.till.discount-remove', { name: d.label })"
        class="-me-1"
        @click="d.remove()"
      />
    </UBadge>
  </div>
  <div class="space-y-3">
    <UFormField
      name="promoCode"
      :label="t('payments.screens.till.discount-add')"
      :ui="{ label: 'sr-only' }"
      :error="pickedChoice?.needsReason ? undefined : refusal?.reason"
    >
      <div
        v-if="pickedChoice?.needsReason"
        class="flex items-center gap-2 rounded-md border border-default px-2.5 py-1.5 text-sm"
      >
        <UIcon
          name="i-lucide-badge-percent"
          class="size-5 shrink-0 text-dimmed"
        />
        <span class="flex-1">{{ pickedChoice.name }}</span>
        <IconButton
          icon="i-lucide-x"
          :label="t('payments.screens.till.discount-remove', { name: pickedChoice.name })"
          @click="clearBox"
        />
      </div>
      <div
        v-else
        class="flex gap-2"
      >
        <UInputMenu
          v-model="picked"
          v-model:search-term="codeTyped"
          :items="choiceItems"
          value-key="value"
          icon="i-lucide-ticket-percent"
          :placeholder="t('payments.screens.till.discount-placeholder')"
          :create-item="{ position: 'top', when: 'always' }"
          :ignore-filter="false"
          :ui="{ base: 'uppercase placeholder:normal-case' }"
          class="min-w-0 flex-1"
          autocomplete="off"
          open-on-focus
          :disabled="trying"
          @focus="loadChoices"
          @create="addCode"
        >
          <template #create-item-label="{ item }">
            {{ t('payments.screens.till.discount-use-code', { code: String(item).toUpperCase() }) }}
          </template>
        </UInputMenu>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('payments.screens.till.discount-apply')"
          :loading="trying"
          :disabled="!codeTyped.trim()"
          @click="addCode()"
        />
      </div>
    </UFormField>
    <UForm
      v-if="pickedChoice?.needsReason"
      :state="{ reason }"
      novalidate
      @submit="addPicked"
    >
      <UFormField
        :label="t('payments.screens.till.discount-reason')"
        name="reason"
        required
        :error="refusal?.reason"
      >
        <div class="flex gap-2">
          <UInput
            v-model="reason"
            maxlength="200"
            class="min-w-0 flex-1"
            autofocus
          />
          <UButton
            type="submit"
            color="neutral"
            variant="outline"
            :label="t('payments.screens.till.discount-give')"
            :loading="trying"
            :disabled="!reason.trim()"
          />
        </div>
      </UFormField>
    </UForm>
  </div>
</template>
