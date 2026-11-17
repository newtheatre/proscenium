<!-- The card readers paired with one provider account: pair another from the code it shows, or retire
     one that is lost or replaced. -->
<script setup lang="ts">
interface Reader { id: string, label: string, active: boolean, createdAt: number }

const props = defineProps<{ accountId: string }>()
const emit = defineEmits<{ loaded: [readers: Reader[]] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { day } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, refresh } = await useAPI<{ readers: Reader[] }>(`/api/payments/providers/${props.accountId}/readers`, { key: `payments:readers:${props.accountId}` })
watch(data, value => emit('loaded', value?.readers.filter(r => r.active) ?? []), { immediate: true })

const pairing = ref(false)
const form = reactive({ pairingCode: '', label: '', key: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
function openPair() {
  Object.assign(form, { pairingCode: '', label: '', key: crypto.randomUUID() })
  refusal.value = null
  pairing.value = true
}
async function pair() {
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/providers/${props.accountId}/readers` as string, { method: 'POST', body: { pairingCode: form.pairingCode.trim(), label: form.label }, headers: { 'idempotency-key': form.key } })
    pairing.value = false
    toast.add({ title: t('payments.screens.readers.paired'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
async function retire(r: Reader) {
  if (!await confirm({ verb: t('payments.screens.readers.retire-verb'), thing: r.label, consequence: t('payments.screens.readers.retire-consequence'), button: t('payments.screens.readers.retire-button') })) return
  try {
    await $api(`/api/payments/readers/${r.id}/retire` as string, { method: 'POST', body: {} })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-sm font-medium">
        {{ t('payments.screens.readers.title') }}
      </h4>
      <UButton
        :label="t('payments.screens.readers.pair')"
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="outline"
        @click="openPair"
      />
    </div>
    <p
      v-if="!data?.readers.some(r => r.active)"
      class="text-sm text-muted"
    >
      {{ t('payments.screens.readers.none') }}
    </p>
    <ul
      v-else
      class="space-y-1"
    >
      <li
        v-for="r in data.readers.filter(r => r.active)"
        :key="r.id"
        class="flex items-center gap-2 text-sm"
      >
        <UIcon
          name="i-lucide-smartphone-nfc"
          class="text-muted"
        />
        <span class="flex-1">{{ r.label }} <span class="text-muted">· {{ t('payments.screens.readers.since', { day: day(r.createdAt) }) }}</span></span>
        <IconButton
          icon="i-lucide-unplug"
          :label="t('payments.screens.readers.retire-label', { reader: r.label })"
          size="xs"
          @click="retire(r)"
        />
      </li>
    </ul>

    <UModal
      v-model:open="pairing"
      :title="t('payments.screens.readers.pair')"
      :description="t('payments.screens.readers.pair-help')"
    >
      <template #body>
        <UForm
          :id="`pair-${accountId}`"
          class="space-y-4"
          :state="form"
          novalidate
          @submit="pair"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('payments.screens.readers.code')"
            required
            :error="refusal?.fields?.pairingCode ? refusal.reason : undefined"
          >
            <UInput
              v-model="form.pairingCode"
              maxlength="9"
              autocomplete="off"
              class="font-mono uppercase"
            />
          </UFormField>
          <UFormField
            :label="t('payments.screens.readers.label')"
            :help="t('payments.screens.readers.label-help')"
            required
          >
            <UInput
              v-model="form.label"
              maxlength="80"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          :form="`pair-${accountId}`"
          :loading="busy"
          :disabled="!/^[A-Za-z0-9]{8,9}$/.test(form.pairingCode.trim()) || !form.label.trim()"
          :label="t('payments.screens.readers.pair-button')"
        />
      </template>
    </UModal>
  </div>
</template>
