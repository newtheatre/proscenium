<!-- On Choose tickets, beside swapping a ticket for a pass (Matt, 19 November): the signed-in buyer's
     tickets for other shows the pass covers, ticked to begin with. Those still ticked become the
     pass's entries, where they stand, once this booking is reserved or paid. -->
<script setup lang="ts">
import type { CoverChoice } from './BoxOfficePassCoverList.vue'
import type { PassSwap } from './BoxOfficePassSwap.vue'

const props = defineProps<{ performanceId: string, swaps: PassSwap[], currency?: string }>()
const covered = defineModel<string[]>({ default: () => [] })

const { t } = useT()
const { $api } = useNuxtApp()
const choices = ref<CoverChoice[]>([])
const others = ref(0)

// The first pass swapped for, as many as were swapped: tickets are matched to them when the booking is held.
const asked = computed(() => {
  const first = props.swaps.find(s => s.count > 0)
  if (!first) return null
  const count = props.swaps.filter(s => s.passTypeId === first.passTypeId).reduce((sum, s) => sum + s.count, 0)
  return { passTypeId: first.passTypeId, passPriceId: first.passPriceId, count }
})
watch(asked, async (now, before) => {
  if (JSON.stringify(now) === JSON.stringify(before)) return
  if (!now) {
    choices.value = []
    others.value = 0
    covered.value = []
    return
  }
  const found = await $api<{ choices: CoverChoice[], others: number }>(`/api/box-office/book/performances/${encodeURIComponent(props.performanceId)}/covers`, { query: now }).catch(() => ({ choices: [], others: 0 }))
  choices.value = found.choices
  others.value = found.others
  covered.value = found.choices.map(c => c.lineId)
}, { immediate: true })
const shows = computed(() => new Set(choices.value.map(c => c.show)).size)
</script>

<template>
  <UCard
    v-if="choices.length"
    :ui="{ body: 'space-y-3' }"
  >
    <div class="space-y-1">
      <h2 class="font-medium">
        {{ t('box-office.covers.online.title', { count: shows }) }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('box-office.covers.online.help') }}
      </p>
    </div>
    <BoxOfficePassCoverList
      v-model="covered"
      :choices="choices"
      :others="others"
      :currency="currency"
    />
  </UCard>
</template>
