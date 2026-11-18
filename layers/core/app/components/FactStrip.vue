<!-- A row of figures about one thing: a small label over each value. Used for a record's summary and
     for a screen's totals, so they look the same everywhere. A chart never replaces one of these: the
     figure stays in text. Extra facts (a module's own, a small chart) go in the default slot. -->
<script setup lang="ts">
export interface Fact { label: string, value: string | number, /** The figure the others lead to. */ strong?: boolean, /** Where the value leads, such as the record it names or a mailto: address. */ to?: string }
defineProps<{ facts: Fact[], /** A border round the strip, when it stands alone on the page. */ framed?: boolean }>()
</script>

<template>
  <dl
    class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3"
    :class="[framed && 'rounded-lg border border-default p-4', facts.length > 3 && 'lg:grid-cols-6']"
  >
    <div
      v-for="fact in facts"
      :key="fact.label"
    >
      <dt class="text-xs text-muted">
        {{ fact.label }}
      </dt>
      <dd
        class="tabular-nums text-highlighted"
        :class="fact.strong !== false && 'font-medium'"
      >
        <ULink
          v-if="fact.to"
          :to="fact.to"
          raw
          class="text-highlighted underline underline-offset-2"
        >
          {{ fact.value }}
        </ULink>
        <template v-else>
          {{ fact.value }}
        </template>
      </dd>
    </div>
    <slot />
  </dl>
</template>
