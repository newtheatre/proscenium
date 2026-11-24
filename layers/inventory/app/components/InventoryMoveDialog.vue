<!-- Moving items to another location (INV-14). A container takes its contents with it; an item in a
     container moves with the container, and one on loan does not move here (I5, I6). -->
<script setup lang="ts">
import type { ItemOptions, Place } from '../../shared/items'

const items = defineModel<{ id: string, tag: string, homeLocationId: string }[]>('items', { required: true })
const emit = defineEmits<{ moved: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const open = computed({ get: () => items.value.length > 0, set: (v) => { if (!v) items.value = [] } })
const locationId = ref<string | undefined>()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const locations = ref<Place[]>([])
const locationItems = computed(() => locationTree(locations.value).map(r => ({ value: r.location.id, label: r.path })))
const title = computed(() => items.value.length === 1 ? t('inventory.move.title-one', { tag: items.value[0]!.tag }) : t('inventory.move.title', { count: items.value.length }))

watch(open, async (now) => {
  if (!now) return
  refusal.value = null
  locationId.value = items.value.length === 1 ? items.value[0]!.homeLocationId : undefined
  if (!locations.value.length) locations.value = (await $api<ItemOptions>('/api/inventory/items/options')).locations
})

async function move() {
  if (!locationId.value) return
  refusal.value = null
  busy.value = true
  try {
    await $api('/api/inventory/items/move', { method: 'POST', body: { itemIds: items.value.map(i => i.id), locationId: locationId.value } })
    toast.add({ title: t('inventory.move.done', { count: items.value.length }), color: 'success' })
    items.value = []
    emit('moved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UFormField
          :label="t('inventory.move.to')"
          :help="t('inventory.move.help')"
          required
        >
          <USelectMenu
            v-model="locationId"
            value-key="value"
            :items="locationItems"
            class="min-w-64"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton
        :loading="busy"
        :disabled="!locationId"
        :label="t('inventory.move.action')"
        @click="move"
      />
    </template>
  </UModal>
</template>
