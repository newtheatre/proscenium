<!-- Adding or changing a storage location (INV-07): its name, what it is inside, and optionally the
     venue and space it is in. Moving it carries everything inside it; four levels is the deepest. -->
<script setup lang="ts">
import { LOCATION_DEPTH, type Location } from '../../shared/setup'
import { insideOf, type TreeRow } from '../utils/location-tree'

interface Venue { id: string, name: string, spaces: { id: string, name: string }[] }
const props = defineProps<{ location: Location | null, parentId: string | null, tree: TreeRow[], venues: Venue[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { refusal, save } = useInventorySetup('/api/inventory/locations', () => emit('saved'))
const form = ref({ name: '', parentId: null as string | null, venueId: null as string | null, spaceId: null as string | null })
const locationForm = useFormRef('locationForm')

// A location may go inside any active one that is not itself or inside it, and is not already four deep.
const parentItems = computed(() => {
  const barred = props.location ? insideOf(props.tree.map(r => r.location), props.location.id) : new Set<string>()
  return props.tree.filter(r => r.location.state === 'active' && !barred.has(r.location.id) && r.depth < LOCATION_DEPTH).map(r => ({ value: r.location.id, label: r.path }))
})
const venueItems = computed(() => props.venues.map(v => ({ value: v.id, label: v.name })))
const spaceItems = computed(() => (props.venues.find(v => v.id === form.value.venueId)?.spaces ?? []).map(s => ({ value: s.id, label: s.name })))
watch(() => form.value.venueId, () => { if (!spaceItems.value.some(s => s.value === form.value.spaceId)) form.value.spaceId = null })

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const l = props.location
  form.value = l ? { name: l.name, parentId: l.parentId, venueId: l.venueId, spaceId: l.spaceId } : { name: '', parentId: props.parentId, venueId: null, spaceId: null }
}, { immediate: true })

async function submit() {
  const body = { ...form.value, name: form.value.name.trim() }
  const done = t(props.location ? 'inventory.setup.saved' : 'inventory.locations.added', { name: body.name })
  if (await save(props.location?.id ?? null, body, done)) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="location ? t('inventory.setup.edit-title', { name: location.name }) : t('inventory.locations.add')"
  >
    <template #body>
      <UForm
        id="inventory-location"
        ref="locationForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ name: form.name })"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('inventory.setup.name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="60"
          />
        </UFormField>
        <UFormField
          :label="t('inventory.locations.inside')"
          :help="t('inventory.locations.inside-help')"
        >
          <USelectMenu
            v-model="form.parentId"
            :items="parentItems"
            value-key="value"
            :placeholder="t('inventory.locations.top')"
            clear
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('inventory.locations.venue')"
            :help="t('inventory.locations.venue-help')"
          >
            <USelectMenu
              v-model="form.venueId"
              :items="venueItems"
              value-key="value"
              :placeholder="t('inventory.locations.no-venue')"
              clear
            />
          </UFormField>
          <UFormField :label="t('inventory.locations.space')">
            <USelectMenu
              v-model="form.spaceId"
              :items="spaceItems"
              value-key="value"
              :disabled="!form.venueId"
              :placeholder="t('inventory.locations.no-space')"
              clear
            />
          </UFormField>
        </div>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="inventory-location"
        :loading="locationForm?.loading"
        :label="location ? t('inventory.setup.save') : t('inventory.locations.add')"
      />
    </template>
  </UModal>
</template>
