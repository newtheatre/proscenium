<!-- What an access application says, in the same words for the person and for a reviewer (ID-38,
     ID-40): the ticked needs with their notes, the wheelchair answer, the companions and anything
     else. The companion and "anything else" entries the server sets are not repeated as needs. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../composables/useAccessApplicationForm'
import { DERIVED, WHEELCHAIR } from '../../shared/access-scheme'

const props = defineProps<{
  value: AccessApplicationValue
  /** The scheme's list, with retired entries, so every term can be named. */
  needs: { id: string, key?: string, label: string }[]
}>()

const { t } = useT()
const keyOf = (term: string) => props.needs.find(n => n.id === term)?.key
const labelOf = (term: string) => props.needs.find(n => n.id === term)?.label ?? t('core.access.retired-need')

const chair = computed(() => {
  const keys = props.value.needs.map(n => keyOf(n.term))
  return keys.includes(WHEELCHAIR.stays) ? 'stays' : keys.includes(WHEELCHAIR.transfers) ? 'transfers' : null
})
const listed = computed(() => props.value.needs.filter((n) => {
  const key = keyOf(n.term)
  if (key === WHEELCHAIR.stays || key === WHEELCHAIR.transfers) return false
  if (key === DERIVED.companion && props.value.companions > 0) return false
  if (key === DERIVED.other && props.value.other) return false
  return true
}))
</script>

<template>
  <div class="space-y-2">
    <ul
      v-if="listed.length"
      class="list-disc space-y-1 ps-5"
    >
      <li
        v-for="need in listed"
        :key="need.term"
      >
        {{ labelOf(need.term) }}<span
          v-if="need.note"
          class="text-muted"
        > ({{ need.note }})</span>
      </li>
    </ul>
    <p v-if="chair">
      {{ t(`core.access.summary.wheelchair-${chair}`) }}
    </p>
    <p>{{ value.companions ? t('core.access.companions', { count: value.companions }) : t('core.access.companions-none') }}</p>
    <div v-if="value.other">
      <p class="font-medium">
        {{ t('core.access.form.other') }}
      </p>
      <p class="whitespace-pre-line">
        {{ value.other }}
      </p>
    </div>
  </div>
</template>
