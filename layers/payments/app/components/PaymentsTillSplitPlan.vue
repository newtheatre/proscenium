<!-- Splitting a till sale before anything is taken (Matt, 18 November 2026): each item on the receipt
     is given to a person with one press, and people are added or taken away. A person taken away
     hands their items to the first. -->
<script setup lang="ts">
import type { Unit } from '../../shared/till'

const props = defineProps<{
  units: Unit[]
  busy: boolean
  money: (minor: number) => string
}>()
/** Who pays for each unit, by person number. */
const owners = defineModel<number[]>('owners', { required: true })
const people = defineModel<number>('people', { required: true })
const { t } = useT()

function give(i: number, n: number) {
  owners.value = props.units.map((_, j) => (j === i ? n : owners.value[j] ?? 1))
}
function addPerson() {
  if (people.value < props.units.length) people.value++
}
function removePerson() {
  if (people.value <= 2) return
  const last = people.value
  owners.value = owners.value.map(o => (o === last ? 1 : o))
  people.value--
}
</script>

<template>
  <div class="space-y-2">
    <p class="font-medium">
      {{ t('payments.screens.till.split-title') }}
    </p>
    <p class="text-sm text-muted">
      {{ t('payments.screens.till.split-help') }}
    </p>
    <ul class="divide-y divide-default">
      <li
        v-for="(u, i) in units"
        :key="i"
        class="flex items-center justify-between gap-3 py-2"
      >
        <span class="min-w-0 flex-1 truncate text-sm">{{ u.label }}</span>
        <span class="text-sm tabular-nums text-muted">{{ money(u.amountMinor) }}</span>
        <UFieldGroup
          role="radiogroup"
          :aria-label="t('payments.screens.till.give-to', { item: u.label })"
        >
          <UButton
            v-for="n in people"
            :key="n"
            size="sm"
            role="radio"
            :aria-checked="owners[i] === n"
            :aria-label="t('payments.screens.till.person', { n })"
            :color="owners[i] === n ? 'primary' : 'neutral'"
            :variant="owners[i] === n ? 'solid' : 'outline'"
            :label="String(n)"
            :disabled="busy"
            @click="give(i, n)"
          />
        </UFieldGroup>
      </li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        color="neutral"
        variant="link"
        icon="i-lucide-user-plus"
        :disabled="busy || people >= units.length"
        :label="t('payments.screens.till.add-person')"
        @click="addPerson"
      />
      <UButton
        v-if="people > 2"
        size="sm"
        color="neutral"
        variant="link"
        icon="i-lucide-user-minus"
        :disabled="busy"
        :label="t('payments.screens.till.remove-person', { n: people })"
        @click="removePerson"
      />
    </div>
  </div>
</template>
