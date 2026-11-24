<!-- Matching a wanted line to an item (INV-18): search the department's kit by tag or name, each item
     saying whether it is free over the loan's window. Once the loan is approved, matching promises. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import type { LoanLine } from '../../shared/loans'
import type { Candidate } from '../../shared/pull-lists'

const props = defineProps<{ loanId: string }>()
const line = defineModel<LoanLine | null>('line', { required: true })
const emit = defineEmits<{ matched: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const open = computed({ get: () => !!line.value, set: (v) => { if (!v) line.value = null } })
const term = ref('')
const itemId = ref<string | undefined>()
const found = ref<Candidate[]>([])
const loading = ref(false)
const busy = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const items = computed(() => found.value.map(c => ({
  id: c.id, label: `${c.tag} · ${c.name}`, description: c.free ? t('inventory.loan.free') : t('inventory.loan.unfree.taken'),
})))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  term.value = line.value?.wanted ?? ''
  itemId.value = undefined
})
watchDebounced(term, async (q) => {
  if (!q.trim()) return
  loading.value = true
  try {
    found.value = (await $api<{ items: Candidate[] }>(`/api/inventory/loans/${props.loanId}/candidates`, { query: { q: q.trim() } })).items
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    loading.value = false
  }
}, { debounce: 250, immediate: true }) // not-policy: a pause in typing

async function match() {
  if (!itemId.value || !line.value) return
  refusal.value = null
  busy.value = true
  try {
    await $api(`/api/inventory/loans/${props.loanId}/lines/${line.value.id}/match`, { method: 'POST', body: { itemId: itemId.value } })
    toast.add({ title: t('inventory.loan.matched'), color: 'success' })
    line.value = null
    emit('matched')
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
  <UModal
    v-model:open="open"
    :title="t('inventory.loan.match-title', { wanted: line?.wanted ?? '' })"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UFormField
          :label="t('inventory.loan.match-item')"
          :help="t('inventory.loan.match-help')"
          required
        >
          <USelectMenu
            v-model="itemId"
            v-model:search-term="term"
            :items="items"
            value-key="id"
            label-key="label"
            description-key="description"
            ignore-filter
            :loading="loading"
            class="min-w-72"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton
        :loading="busy"
        :disabled="!itemId"
        :label="t('inventory.loan.match')"
        @click="match"
      />
    </template>
  </UModal>
</template>
