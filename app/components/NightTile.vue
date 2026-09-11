<script setup lang="ts">
// One of the hub's six actions: a whole card is the tap target, so a thumb in a dark foyer needs
// no aim at all (K-102 criterion 2). Never a spinner and never a hover state.
const props = withDefaults(defineProps<{
  label: string
  hint?: string
  icon: string
  to: string
  tone?: 'gold' | 'neutral' | 'danger'
}>(), { tone: 'neutral' })

const surface = computed(() => ({
  gold: 'bg-secondary text-inverted',
  neutral: 'bg-elevated text-default ring-1 ring-default',
  danger: 'bg-error/10 text-default ring-1 ring-error/50',
}[props.tone]))

const iconTone = computed(() => ({
  gold: 'text-inverted',
  neutral: 'text-secondary',
  danger: 'text-error',
}[props.tone]))

const hintTone = computed(() => props.tone === 'gold' ? 'text-inverted/70' : 'text-muted')
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex min-h-36 flex-col justify-between rounded-xl p-4 transition-transform active:scale-[0.98]"
    :class="surface"
  >
    <UIcon
      :name="icon"
      class="size-8 shrink-0"
      :class="iconTone"
    />
    <span>
      <span class="nnt-headline block text-xl leading-tight font-bold">{{ label }}</span>
      <span
        v-if="hint"
        class="mt-1 block text-sm"
        :class="hintTone"
      >{{ hint }}</span>
    </span>
  </NuxtLink>
</template>
