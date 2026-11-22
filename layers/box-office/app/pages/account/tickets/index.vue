<!-- My tickets (C3): every booking on the person's account, one card for each performance. Nights still
     to come are first, soonest first, each paid ticket with its code to scan at the door; past ones
     are folded away below. -->
<script setup lang="ts">
import { byPerformance, type MyBookings } from '../../../utils/my-bookings'

const { t } = useT()
const { data, status, error, refresh } = await useAPI<MyBookings>('/api/box-office/orders/mine', { key: 'box-office:mine' })
const pastOpen = ref(false)
// The night is the unit: several bookings for one performance share a card.
const upcoming = computed(() => byPerformance(data.value?.upcoming ?? []))
const past = computed(() => byPerformance(data.value?.past ?? []))
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.mine.label')"
    :description="t('box-office.mine.help')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <EmptyState
          v-if="!data.upcoming.length"
          :title="t('box-office.mine.empty')"
          :description="t('box-office.mine.empty-description')"
          icon="i-lucide-ticket"
        >
          <template #actions>
            <UButton
              to="/whats-on"
              :label="t('box-office.mine.see-whats-on')"
            />
          </template>
        </EmptyState>
        <section
          v-else
          :aria-label="t('box-office.mine.upcoming')"
          class="space-y-4"
        >
          <BoxOfficeVisit
            v-for="n in upcoming"
            :key="n.performance.id"
            :night="n"
          />
        </section>
        <CollapsibleDivider
          v-model:open="pastOpen"
          :label="t('box-office.mine.past')"
          :count="data.past.length"
        >
          <div class="space-y-4">
            <BoxOfficeVisit
              v-for="n in past"
              :key="n.performance.id"
              :night="n"
              past
            />
          </div>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
