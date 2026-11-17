<script setup lang="ts">
import { showsList } from '../../../../shared/shows'

interface Performance { id: string, when: string, venue: string, state: string }
interface Show { id: string, title: string, opens: string, state: string, venue: string, performances: Performance[] }
</script>

<template>
  <PageList
    title="Sample shows"
    route="/api/gallery/shows"
    :list="showsList"
    :row-label="(row: Show) => row.title"
    :row-to="(row: Show) => `/console/gallery/shows?open=${row.id}`"
    :sub-rows="(row: Show) => row.performances as unknown as Show[]"
    sub-rows-noun="performances"
    :sub-row-label="(row: Show) => (row as unknown as Performance).when"
    :empty="{ title: 'No shows', description: 'Shows you add will be listed here.', icon: 'i-lucide-drama' }"
  >
    <template #note="{ result }">
      {{ (result.hidden as { cancelled: number }).cancelled }} cancelled shows are not shown.
    </template>
    <template #subcell-state="{ row }">
      {{ (row as unknown as Performance).state }}
    </template>
    <template #subcell-venue="{ row }">
      {{ (row as unknown as Performance).venue }}
    </template>
  </PageList>
</template>
