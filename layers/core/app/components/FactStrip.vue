<!-- A row of figures about one thing: a small label over each value. Used for a record's summary and
     for a screen's totals, so they look the same everywhere. A chart never replaces one of these: the
     figure stays in text. Extra facts (a module's own, a small chart) go in the default slot. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
export interface Fact { label: string, value: string | number, /** The figure the others lead to. */ strong?: boolean, /** Where the value leads, such as the record it names or a mailto: address. */ to?: string }
defineProps<{ facts: Fact[], /** A border round the strip, when it stands alone on the page. */ framed?: boolean, /** Centred in a row, for a card. */ centred?: boolean, /** On a laptop, one row shared evenly however many facts there are. */ row?: boolean }>()
const LONG = 28 // not-policy: the length past which a value takes two columns
</script>

<template>
  <!-- Columns follow the strip's own width, not the window's, so it is not cramped in a narrow column. -->
  <div class="@container">
    <dl
      v-bind="$attrs"
      :class="[
        centred ? 'flex flex-wrap justify-center gap-x-8 gap-y-3 text-center' : ['grid grid-cols-2 gap-x-6 gap-y-3 @md:grid-cols-3', row ? '@3xl:auto-cols-fr @3xl:grid-flow-col @3xl:grid-cols-none' : facts.length > 3 && '@3xl:grid-cols-6'],
        framed && 'rounded-lg border border-default p-4',
      ]"
    >
      <div
        v-for="fact in facts"
        :key="fact.label"
        class="min-w-0"
        :class="!centred && !row && String(fact.value).length > LONG && 'col-span-2'"
      >
        <dt class="text-xs text-muted">
          {{ fact.label }}
        </dt>
        <dd
          class="tabular-nums text-highlighted wrap-anywhere"
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
  </div>
</template>
