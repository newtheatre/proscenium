<!-- The membership card (MEM-33, MEM-51), full screen: the holder's name, member number and the date
     it is valid until, with a code Box office signs each time it is opened. Without Box office it
     shows no code. Opened from My membership and from the members' area home. -->
<script setup lang="ts">
import { encode } from 'uqr'

interface Shown { id: string, schemeName: string, endsOn: string | null }
const props = defineProps<{ membership: Shown | null, number?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { day } = useDates()
const { viewer } = useViewer()

const doorCode = ref<string | null>(null)
watch(() => props.membership?.id, async (id) => {
  doorCode.value = null
  if (!id) return
  try {
    doorCode.value = (await $api<{ doorCode: string }>(`/api/box-office/door-codes/mem/${id}` as string)).doorCode
  }
  catch {
    // Box office is off, or the card is no longer offered: the card is shown without a code.
  }
}, { immediate: true })
// The code as an SVG path, one unit square per dark module, with a quiet border of four.
const qr = computed(() => {
  if (!doorCode.value) return null
  const { size, data } = encode(doorCode.value, { border: 4, ecc: 'M' })
  const path = data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('')
  return { size, path }
})
</script>

<template>
  <UModal
    :open="!!membership"
    fullscreen
    :title="membership?.schemeName ?? ''"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <div
        v-if="membership"
        class="mx-auto flex max-w-sm flex-col items-center gap-4 text-center"
      >
        <p
          v-if="viewer.name"
          class="text-2xl font-semibold"
        >
          {{ viewer.name }}
        </p>
        <FactStrip
          :facts="[
            ...(number ? [{ label: t('membership.screens.mine.number'), value: number }] : []),
            { label: t('membership.screens.mine.valid-until'), value: membership.endsOn ? day(membership.endsOn) : t('membership.screens.mine.no-end') },
          ]"
        />
        <svg
          v-if="qr"
          :viewBox="`0 0 ${qr.size} ${qr.size}`"
          class="aspect-square w-72 max-w-full rounded-md bg-white"
          shape-rendering="crispEdges"
          role="img"
          :aria-label="t('membership.screens.mine.card-code')"
        >
          <path
            :d="qr.path"
            fill="black"
          />
        </svg>
        <p class="text-sm text-muted">
          {{ t(qr ? 'membership.screens.mine.card-help' : 'membership.screens.mine.card-no-code') }}
        </p>
      </div>
    </template>
  </UModal>
</template>
