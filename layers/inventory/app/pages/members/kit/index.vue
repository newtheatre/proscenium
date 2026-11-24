<!-- Borrow kit (S12, INV-20): what the theatre lends to members, grouped by department. Choosing dates
     shows what is free then; "Add to request" builds a basket sent from the request page. -->
<script setup lang="ts">
import type { CatalogueItem } from '../../../../shared/borrowing'

const { t } = useT()
const { dates, has, add, remove, lines } = useKitBasket()
const { data, status, error, refresh, q, groups } = useCatalogue(dates)

function badge(i: CatalogueItem) {
  if (i.available === null) return null
  if (!i.available) return { tone: 'danger' as const, label: t('inventory.borrow.not-free') }
  return { tone: 'success' as const, label: i.tracking === 'counted' ? t('inventory.borrow.free-count', { count: i.available }) : t('inventory.loan.free') }
}
</script>

<template>
  <PageFrame
    :title="t('inventory.borrow.title')"
    :description="t('inventory.borrow.description')"
  >
    <template #primary>
      <UButton
        to="/members/kit/request"
        icon="i-lucide-send"
        :disabled="!lines.length"
        :label="t('inventory.borrow.request', { count: lines.length })"
      />
    </template>
    <div class="space-y-6">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField :label="t('inventory.borrow.dates')">
          <FieldDateRange v-model="dates" />
        </UFormField>
        <UFormField :label="t('inventory.borrow.search')">
          <UInput
            v-model="q"
            icon="i-lucide-search"
          />
        </UFormField>
        <UButton
          to="/members/kit/loans"
          color="neutral"
          variant="link"
          :label="t('inventory.borrow.my-loans')"
        />
      </div>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <EmptyState
          v-if="!groups.length"
          icon="i-lucide-package-open"
          :title="t('inventory.borrow.none')"
        />
        <PageSection
          v-for="g in groups"
          :key="g.department"
          :title="g.department"
        >
          <RecordList :label="g.department">
            <RecordListItem
              v-for="i in g.items"
              :key="i.id"
              icon="i-lucide-package"
              :name="i.name"
              :description="`${i.category} · ${i.tag}`"
            >
              <StatusBadge
                v-if="badge(i)"
                :tone="badge(i)!.tone"
                :label="badge(i)!.label"
              />
              <template #trailing>
                <UButton
                  v-if="has(i.id)"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-check"
                  :label="t('inventory.borrow.added')"
                  :aria-label="t('inventory.borrow.remove-named', { name: i.name })"
                  @click="remove(i.id)"
                />
                <UButton
                  v-else
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  :label="t('inventory.borrow.add')"
                  :aria-label="t('inventory.borrow.add-named', { name: i.name })"
                  :disabled="i.available === 0"
                  @click="add(i)"
                />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
