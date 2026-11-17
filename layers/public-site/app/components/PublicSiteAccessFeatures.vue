<!-- Access features as icons with their labels (C-48), each with its note. The label is always shown:
     an icon alone would leave people guessing. A feature with no icon of its own gets a plain tick. -->
<script setup lang="ts">
defineProps<{ features: { termId: string, label: string, icon: string | null, note: string | null }[] }>()
</script>

<template>
  <ul
    v-if="features.length"
    class="grid gap-2 sm:grid-cols-2"
  >
    <li
      v-for="f in features"
      :key="f.termId"
      class="flex items-start gap-2"
    >
      <UIcon
        :name="f.icon ?? 'i-lucide-check'"
        class="mt-0.5 size-5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <span>
        <span class="font-medium">{{ f.label }}</span>
        <span
          v-if="f.note"
          class="text-muted"
        >: {{ f.note }}</span>
      </span>
    </li>
  </ul>
</template>
