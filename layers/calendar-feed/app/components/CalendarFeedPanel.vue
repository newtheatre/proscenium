<!-- The person's private calendar address (C-70, CF1): made the first time it is asked for, copied
     from a read-only box, and replaceable, which stops the old address at once. -->
<script setup lang="ts">
const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()

const address = ref<string | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function show(reset: boolean) {
  refusal.value = null
  try {
    address.value = (await write<{ url: string }>(`/api/calendar-feed/me${reset ? '/reset' : ''}`, { method: 'POST', body: {} })).url
    if (reset) toast.add({ title: t('calendar-feed.panel.reset-done'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function copy() {
  if (!address.value) return
  await navigator.clipboard.writeText(address.value)
  toast.add({ title: t('calendar-feed.panel.copied'), color: 'success' })
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">
      {{ t('calendar-feed.panel.description') }}
    </p>
    <RefusalNotice :refusal="refusal" />
    <UButton
      v-if="!address"
      color="neutral"
      variant="outline"
      icon="i-lucide-calendar-sync"
      :label="t('calendar-feed.panel.show')"
      loading-auto
      @click="show(false)"
    />
    <template v-else>
      <UFieldGroup class="w-full">
        <UInput
          :model-value="address"
          readonly
          :aria-label="t('calendar-feed.panel.address')"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-copy"
          :label="t('calendar-feed.panel.copy')"
          @click="copy"
        />
      </UFieldGroup>
      <UButton
        color="neutral"
        variant="link"
        :label="t('calendar-feed.panel.reset')"
        loading-auto
        @click="show(true)"
      />
    </template>
  </div>
</template>
