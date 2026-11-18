<!-- What is wrong with one page or item, on its card. -->
<script setup lang="ts">
const props = defineProps<{ at: string }>()
const { t } = useT()
const builder = useBuilder()
const problems = computed(() => builder.problemsAt.value.get(props.at) ?? [])
</script>

<template>
  <ul
    v-if="problems.length"
    class="mt-2 space-y-1"
  >
    <li
      v-for="(p, i) in problems"
      :key="i"
      class="flex items-start gap-1.5 text-sm"
      :class="p.level === 'error' ? 'text-error' : 'text-warning'"
    >
      <UIcon
        :name="p.level === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert'"
        class="mt-0.5 shrink-0"
      />
      <span>{{ t(`forms.problems.${p.code}`, p.params ?? {}) }}</span>
    </li>
  </ul>
</template>
