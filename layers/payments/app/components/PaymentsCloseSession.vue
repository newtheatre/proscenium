<!-- Closing a session being counted: the cash counted, the difference from what was expected as it
     is typed, and the reason for any difference. Used on My session and, for someone allowed to close
     any session, on Sessions. -->
<script setup lang="ts">
const props = defineProps<{ session: { id: string, expectedCashMinor: number, currency: string } }>()
const emit = defineEmits<{ closed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()

const countedMinor = ref<number | null>(null)
const note = ref('')
const busy = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const difference = computed(() => (countedMinor.value === null ? null : countedMinor.value - props.session.expectedCashMinor))

async function close() {
  if (countedMinor.value === null) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/sessions/${props.session.id}/close` as string, { method: 'POST', body: { countedMinor: countedMinor.value, varianceNote: note.value.trim() || undefined } })
    toast.add({ title: t('payments.screens.close.done'), color: 'success' })
    emit('closed')
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    class="space-y-4"
    @submit.prevent="close"
  >
    <RefusalNotice :refusal="refusal" />
    <p>{{ t('payments.screens.close.expected', { amount: money(session.expectedCashMinor, session.currency) }) }}</p>
    <UFormField
      :label="t('payments.screens.close.counted')"
      :help="t('payments.screens.close.counted-help')"
      required
      :error="refusal?.fields?.countedMinor ? refusal.reason : undefined"
    >
      <FieldMoney
        v-model="countedMinor"
        :currency="session.currency"
        class="sm:w-56"
      />
    </UFormField>
    <p
      v-if="difference !== null"
      :class="difference === 0 ? 'text-muted' : 'font-medium'"
      aria-live="polite"
    >
      {{ difference === 0 ? t('payments.screens.close.matches') : difference > 0 ? t('payments.screens.close.over', { amount: money(difference, session.currency) }) : t('payments.screens.close.short', { amount: money(-difference, session.currency) }) }}
    </p>
    <UFormField
      v-if="difference"
      :label="t('payments.screens.close.reason')"
      :help="t('payments.screens.close.reason-help')"
      required
      :error="refusal?.fields?.varianceNote ? refusal.reason : undefined"
    >
      <UTextarea
        v-model="note"
        maxlength="200"
        :rows="2"
        class="w-full"
      />
    </UFormField>
    <UButton
      type="submit"
      :loading="busy"
      :disabled="countedMinor === null || (!!difference && !note.trim())"
      :label="t('payments.screens.close.button')"
    />
  </form>
</template>
