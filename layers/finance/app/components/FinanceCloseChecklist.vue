<!-- A period's close checklist: what stops it closing, then what only warns, each linked to its fix. -->
<script setup lang="ts">
interface Item { sentence: string, to?: string }
defineProps<{ blockers: Item[], warnings?: Item[] }>()
const { t } = useT()
</script>

<template>
  <p
    v-if="!blockers.length"
    class="flex items-center gap-2"
  >
    <UIcon
      name="i-lucide-circle-check"
      class="text-success"
    />
    {{ t('finance.screens.period.ready') }}
  </p>
  <ul
    v-else
    class="space-y-2"
  >
    <li
      v-for="(b, i) in blockers"
      :key="i"
      class="flex items-start gap-2"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="mt-0.5 shrink-0 text-warning"
      />
      <ULink
        v-if="b.to"
        :to="b.to"
        class="underline"
      >
        {{ b.sentence }}
      </ULink>
      <span v-else>{{ b.sentence }}</span>
    </li>
  </ul>
  <div
    v-if="warnings?.length"
    class="mt-4 space-y-2"
  >
    <p class="text-sm text-muted">
      {{ t('finance.screens.period.warnings') }}
    </p>
    <ul class="space-y-2">
      <li
        v-for="(w, i) in warnings"
        :key="i"
        class="flex items-start gap-2"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 shrink-0 text-info"
        />
        <ULink
          v-if="w.to"
          :to="w.to"
          class="underline"
        >
          {{ w.sentence }}
        </ULink>
        <span v-else>{{ w.sentence }}</span>
      </li>
    </ul>
  </div>
</template>
