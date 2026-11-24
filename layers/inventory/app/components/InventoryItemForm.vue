<!-- Adding an item, or several alike, and changing one (S3, INV-10, INV-11). Validated with the
     schema the server uses; a counted item is one row with a quantity. -->
<script setup lang="ts">
import { itemForm } from '../../shared/item-input'
import type { ItemDetail, ItemOptions } from '../../shared/items'

const props = defineProps<{ item: ItemDetail | null }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { data: options } = await useAPI<ItemOptions>('/api/inventory/items/options', { key: 'inventory:item-options' })
const { fields, initial, body } = useItemForm(options, props.item)
const title = computed(() => props.item ? t('inventory.setup.edit-title', { name: `${props.item.tag} · ${props.item.name}` }) : t('inventory.items.add'))
const trail = computed(() => [
  { label: t('inventory.navigation.items.label'), to: '/console/inventory' },
  ...props.item ? [{ label: props.item.tag, to: `/console/inventory/items/${props.item.id}` }] : [],
])

async function submit(values: Record<string, unknown>) {
  const { categoryId, request } = body(values)
  if (props.item) return $api(`/api/inventory/items/${props.item.id}`, { method: 'PUT', body: request })
  return $api(`/api/inventory/categories/${categoryId}/items`, { method: 'POST', body: request })
}
</script>

<template>
  <PageForm
    :title="title"
    :description="item ? undefined : t('inventory.item-form.description-add')"
    :submit-label="item ? t('inventory.setup.save') : t('inventory.items.add')"
    :schema="itemForm"
    :fields="fields"
    :initial="initial"
    :submit="submit"
    :trail="trail"
    :return-to="item ? `/console/inventory/items/${item.id}` : '/console/inventory'"
    :saved-title="item ? undefined : t('inventory.item-form.added')"
  />
</template>
