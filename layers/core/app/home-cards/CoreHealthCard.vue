<!-- The Admin overview's health card (AC-5, AC-12): each health check that is not ok, failing
     first, with what to do and where. Absent while every check is ok. -->
<script setup lang="ts">
interface Problem { id: string, state: 'warning' | 'failing', sentence: string, remedy?: string, to?: string }

defineProps<{ count?: number }>()
const { t } = useT()
const { data } = await useAPI<{ problems: Problem[] }>('/api/core/health/problems', { key: 'core:health-problems', default: () => ({ problems: [] }) })
</script>

<template>
  <div class="space-y-3">
    <p class="font-medium">
      {{ t('core.admin.health.line', { count: count ?? data?.problems.length ?? 0 }) }}
    </p>
    <ul class="space-y-3">
      <li
        v-for="p in data?.problems ?? []"
        :key="p.id"
        class="space-y-1"
      >
        <StatusBadge
          :tone="p.state === 'failing' ? 'danger' : 'warning'"
          :label="t(`core.admin.health.${p.state}`)"
        />
        <p class="text-sm">
          {{ p.sentence }}
        </p>
        <p
          v-if="p.remedy"
          class="text-sm text-muted"
        >
          {{ p.remedy }}
        </p>
        <UButton
          v-if="p.to"
          :to="p.to"
          :label="t('core.admin.health.fix')"
          size="sm"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-right"
        />
      </li>
    </ul>
  </div>
</template>
