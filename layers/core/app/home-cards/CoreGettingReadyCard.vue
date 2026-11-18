<!-- Admin's overview after setup (core.home-card): "Get your theatre ready", the first steps a new
     theatre takes, each ticked once done and otherwise a link to where it is done. -->
<script setup lang="ts">
defineProps<{ count?: number }>()
const { t } = useT()
const { data } = useAPI<{ items: { id: string, done: boolean, to: string }[] }>('/api/core/getting-ready', { key: 'core:getting-ready', default: () => ({ items: [] }) })
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="font-medium">
        {{ t('core.getting-ready.title') }}
      </p>
      <p class="text-sm text-muted">
        {{ t('core.getting-ready.line', { count: count ?? 0 }) }}
      </p>
    </div>
    <ul class="space-y-1.5 text-sm">
      <li
        v-for="item in data.items"
        :key="item.id"
        class="flex items-start gap-2"
      >
        <UIcon
          :name="item.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
          :class="item.done ? 'text-success' : 'text-dimmed'"
          class="mt-0.5 size-4 shrink-0"
        />
        <span
          v-if="item.done"
          class="text-muted"
        >
          {{ t(`core.getting-ready.items.${item.id}`) }}
          <span class="sr-only">{{ t('core.getting-ready.done') }}</span>
        </span>
        <ULink
          v-else
          :to="item.to"
          class="text-highlighted underline-offset-2 hover:underline"
        >
          {{ t(`core.getting-ready.items.${item.id}`) }}
        </ULink>
      </li>
    </ul>
  </div>
</template>
