<!-- Change an item (S3): the same form, starting from what it says now. -->
<script setup lang="ts">
import type { ItemPage } from '../../../../../../shared/items'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<ItemPage>(() => `/api/inventory/items/${encodeURIComponent(id.value)}`, { key: `inventory:item:${id.value}` })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <InventoryItemForm :item="d.item" />
    </template>
  </DataBoundary>
</template>
