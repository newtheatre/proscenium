<!-- One card on My account's overview: a part of the person's life at the theatre, how it stands in
     a line, its status as a word when it has one, and the way in. Every module's account section
     draws itself with this, so the cards line up whoever made them. -->
<script setup lang="ts">
const props = defineProps<{
  /** The id the page gives the section, for this card's heading. */
  headingId: string
  title: string
  /** How it stands, in a line: "Student membership, until 31 Aug 2028". */
  description?: string
  to: string
  icon?: string
  status?: { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral', label: string }
}>()
</script>

<template>
  <UPageCard
    :to="props.to"
    :icon="props.icon"
    :title="props.title"
    :description="props.description"
    orientation="horizontal"
    :ui="{ container: 'lg:grid-cols-[1fr_auto]' }"
  >
    <template #title>
      <h3 :id="props.headingId">
        {{ props.title }}
      </h3>
    </template>
    <div class="flex items-center justify-end gap-2">
      <StatusBadge
        v-if="props.status"
        v-bind="props.status"
      />
      <UIcon
        name="i-lucide-chevron-right"
        class="size-5 text-dimmed"
      />
    </div>
  </UPageCard>
</template>
