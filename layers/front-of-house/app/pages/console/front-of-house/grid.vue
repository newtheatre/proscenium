<!-- The rota grid (FH-48): show nights across, venues and duties down. Pick cells, then apply a rota
     template to them as one batch per venue, or add one shift in each; right-click a shift for more. -->
<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import { GRID_ANY, shiftPage, type GridShift } from '../../../utils/rota-grid'

const { t } = useT()
const grid = await useRotaGrid()
const { range, crewCall, venue, duty, unfilled, query, data, status, error, refresh, choices, venues, picked, isPicked, togglePick } = grid

const anyItem = (label: string) => ({ value: GRID_ANY, label })
const callItems = computed(() => [anyItem(t('front-of-house.grid.any-call')), ...(choices.value?.crewCalls ?? []).map(c => ({ value: c.id, label: c.name }))])
const venueItems = computed(() => [anyItem(t('front-of-house.any-venue')), ...(choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const dutyItems = computed(() => [anyItem(t('front-of-house.grid.any-duty')), ...(choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name }))])
const dutyCells = computed(() => picked.value.filter(p => p.dutyId))

const applying = ref(false)
const adding = ref(false)
const batchesOpen = ref(false)
const copying = ref<{ shift: GridShift, day: string } | null>(null)
const cancelling = ref<GridShift | null>(null)

function menuFor(s: GridShift, day: string): ContextMenuItem[][] {
  const open = [{ label: t('front-of-house.grid.open-shift'), icon: 'i-lucide-arrow-right', to: shiftPage(s.id) }]
  if (!data.value?.can.manage || s.state === 'completed') return [open]
  return [open, [
    { label: t('front-of-house.grid.copy'), icon: 'i-lucide-copy', onSelect: () => { copying.value = { shift: s, day } } },
    { label: t('front-of-house.grid.cancel-shift'), icon: 'i-lucide-ban', color: 'error' as const, onSelect: () => { cancelling.value = s } },
  ]]
}
async function done() {
  picked.value = []
  await refresh()
}
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.grid.label')"
    :description="t('front-of-house.grid.description')"
  >
    <template #primary>
      <UButton
        v-if="data?.can.manage"
        color="neutral"
        variant="outline"
        icon="i-lucide-layers"
        :label="t('front-of-house.grid.batches')"
        @click="batchesOpen = true"
      />
    </template>
    <div class="space-y-6">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField :label="t('front-of-house.grid.days')">
          <FieldDateRange v-model="range" />
        </UFormField>
        <UFormField :label="t('front-of-house.grid.crew-call')">
          <USelectMenu
            v-model="crewCall"
            :items="callItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('front-of-house.venue')">
          <USelectMenu
            v-model="venue"
            :items="venueItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('front-of-house.grid.duty')">
          <USelectMenu
            v-model="duty"
            :items="dutyItems"
            value-key="value"
          />
        </UFormField>
        <UCheckbox
          v-model="unfilled"
          :label="t('front-of-house.rota.unfilled')"
        />
      </div>
      <PageSection
        v-if="picked.length && data?.can.manage"
        :title="t('front-of-house.grid.picked', { count: picked.length })"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-layout-list"
            :label="t('front-of-house.grid.apply')"
            @click="applying = true"
          />
          <UButton
            v-if="dutyCells.length"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('front-of-house.grid.add', { count: dutyCells.length })"
            @click="adding = true"
          />
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('front-of-house.grid.clear')"
            @click="picked = []"
          />
        </div>
      </PageSection>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <EmptyState
            v-if="!venues.length"
            icon="i-lucide-grid-3x3"
            :title="t('front-of-house.grid.empty.title')"
            :description="t('front-of-house.grid.empty.description')"
          />
          <FrontOfHouseGridTable
            v-else
            :days="d.days"
            :venues="venues"
            :manage="d.can.manage"
            :is-picked="isPicked"
            :menu-for="menuFor"
            @pick="togglePick"
          />
        </template>
      </DataBoundary>
    </div>

    <FrontOfHouseGridApply
      v-model:open="applying"
      :picked="picked"
      :choices="choices"
      :crew-call="crewCall"
      @done="done"
    />
    <FrontOfHouseGridAdd
      v-model:open="adding"
      :cells="dutyCells"
      :crew-call-id="query.crewCallId"
      @done="done"
    />
    <FrontOfHouseGridShiftActions
      v-model:copying="copying"
      v-model:cancelling="cancelling"
      :days="data?.days ?? []"
      @done="refresh()"
    />
    <FrontOfHouseGridBatches
      v-model:open="batchesOpen"
      :crew-call-id="query.crewCallId"
      @changed="refresh()"
    />
  </PageFrame>
</template>
