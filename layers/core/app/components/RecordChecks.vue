<!-- A record's readiness checklist (R-35): each line is a sentence with a mark and, where something
     is missing, a link to the place that fixes it. A line the action does not need says it is only
     recommended. It reports; it never blocks. -->
<script setup lang="ts">
defineProps<{
  title: string
  checks: { id: string, done: boolean, sentence: string, link?: string, needed?: boolean }[]
}>()
const { t } = useT()
</script>

<template>
  <section class="rounded-lg border border-default p-4">
    <h2 class="mb-2 text-sm font-semibold text-highlighted">
      {{ title }}
    </h2>
    <ul class="space-y-2 text-sm">
      <li
        v-for="c in checks"
        :key="c.id"
        class="flex items-start gap-2"
      >
        <UIcon
          :name="c.done ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
          :class="c.done ? 'text-success' : 'text-muted'"
          class="mt-0.5 size-4 shrink-0"
        />
        <span class="sr-only">{{ c.done ? t('core.record.check-done') : t('core.record.check-open') }}:</span>
        <ULink
          v-if="c.link && !c.done"
          :to="c.link"
          class="hover:underline"
        >
          {{ c.sentence }}
        </ULink>
        <span v-else>{{ c.sentence }}</span>
        <span
          v-if="c.needed === false && !c.done"
          class="text-muted"
        >({{ t('core.record.check-wanted') }})</span>
      </li>
    </ul>
  </section>
</template>
