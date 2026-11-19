<!-- Tickets an issued pass could cover, with the button that uses it for them (Matt, 19 November):
     on the holder's passes page (`mine`), and for staff on the holders list and at the till. Shown
     only while there are some. -->
<script setup lang="ts">
import type { CoverChoice } from './BoxOfficePassCoverList.vue'

const props = defineProps<{ passId: string, currency?: string, mode: 'mine' | 'staff', /** At the till: who holds it, for the title. */ holder?: string | null }>()
const emit = defineEmits<{ covered: [count: number] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const base = computed(() => props.mode === 'mine' ? `/api/box-office/passes/mine/${encodeURIComponent(props.passId)}/covers` : `/api/box-office/passes/${encodeURIComponent(props.passId)}/covers`)
const choices = ref<CoverChoice[]>([])
const others = ref(0)
const ticked = ref<string[]>([])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const dismissed = ref(false)

async function load() {
  // A seller who may not change bookings is simply not offered this.
  const found = await $api<{ choices: CoverChoice[], others: number }>(base.value).catch(() => ({ choices: [], others: 0 }))
  choices.value = found.choices
  others.value = found.others
  ticked.value = found.choices.map(c => c.lineId)
}
watch(() => props.passId, () => {
  dismissed.value = false
  void load()
}, { immediate: true })

let keys = 0
async function use() {
  refusal.value = null
  busy.value = true
  try {
    const done = await $api<{ covered: number }>(base.value, { method: 'POST', body: { lineIds: ticked.value }, headers: { 'idempotency-key': `pass-covers:${props.passId}:${Date.now()}:${++keys}` } })
    toast.add({ title: t(props.mode === 'mine' ? 'box-office.covers.used' : 'box-office.covers.staff.used', { count: done.covered }), color: 'success' })
    emit('covered', done.covered)
    await load()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
const title = computed(() => props.holder !== undefined ? t('box-office.covers.till.title', { holder: props.holder ?? t('box-office.screens.panel.pass.no-holder') }) : t(props.mode === 'mine' ? 'box-office.covers.mine.title' : 'box-office.covers.staff.title'))
</script>

<template>
  <section
    v-if="choices.length && !dismissed"
    class="space-y-3"
  >
    <div class="space-y-1">
      <h3 class="font-medium">
        {{ title }}
      </h3>
      <p class="text-sm text-muted">
        {{ t(mode === 'mine' ? 'box-office.covers.mine.help' : 'box-office.covers.staff.help') }}
      </p>
    </div>
    <RefusalNotice :refusal="refusal" />
    <BoxOfficePassCoverList
      v-model="ticked"
      :choices="choices"
      :others="others"
      :currency="currency"
      :staff="mode === 'staff'"
      :disabled="busy"
    />
    <div class="flex flex-wrap gap-2">
      <UButton
        :label="t('box-office.covers.use')"
        :loading="busy"
        :disabled="!ticked.length"
        @click="use"
      />
      <UButton
        v-if="holder !== undefined"
        color="neutral"
        variant="ghost"
        :label="t('box-office.covers.till.not-now')"
        @click="dismissed = true"
      />
    </div>
  </section>
</template>
