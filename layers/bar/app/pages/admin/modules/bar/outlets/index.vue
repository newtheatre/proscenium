<!-- Outlets (S13), with the price lists they sell from as a section below: the places that sell, such as the foyer bar or an interval kiosk, each with the
     price list it sells from and where it is. One outlet at most is the box office desk. An outlet
     that has sold is retired, not deleted; retired ones sit below a divider. -->
<script setup lang="ts">
import { outletInput, outletPatch } from '../../../../../../server/input'

type Kind = 'bar' | 'kiosk' | 'desk'
type Layout = 'chips' | 'folders' | 'rail'
interface Outlet { id: string, name: string, kind: Kind, priceListId: string, priceList: string, spaceId: string | null, stockLocationId: string | null, tillLayout: Layout, favourites: string[], active: boolean }
interface Option { id: string, name: string }
interface Size { id: string, product: string, size: string, category: string, pricedOn: string[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
// The tab is for whoever sets up outlets or prices: each sees the part they may change.
const { data: may } = await useAPI<{ setup: { outlets: boolean, prices: boolean } }>('/api/bar/may', { key: 'bar:may' })
const { data, status, error, refresh } = await useAPI<{ outlets: Outlet[], lists: Option[], spaces: Option[], locations: Option[], sizes: Size[] }>('/api/bar/outlets', { key: 'bar:outlets', immediate: !!may.value?.setup.outlets })

const kindItems = computed(() => (['bar', 'kiosk', 'desk'] as const).map(k => ({ value: k, label: t(`bar.screens.outlets.kinds.${k}`) })))
const listItems = computed(() => (data.value?.lists ?? []).map(l => ({ value: l.id, label: l.name })))
const spaceItems = computed(() => [{ value: 'none', label: data.value?.spaces.length ? t('bar.screens.outlets.no-space') : t('bar.screens.outlets.no-spaces') }, ...(data.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name }))])
const locationItems = computed(() => [{ value: 'none', label: t('bar.screens.outlets.no-stock') }, ...(data.value?.locations ?? []).map(l => ({ value: l.id, label: l.name }))])
const layoutItems = computed(() => (['chips', 'folders', 'rail'] as const).map(l => ({ value: l, label: t(`bar.screens.outlets.layouts.${l}`) })))
// "Each" is never shown: a one-size product is just its name.
const sizeLabel = (s: Size) => s.size === 'Each' ? s.product : `${s.product} · ${s.size}`
// Only sizes with a price on the outlet's list can be pinned: one with none is not on its till.
const sizeItems = computed(() => (data.value?.sizes ?? []).filter(s => s.pricedOn.includes(form.value?.priceListId ?? '') || form.value?.favourites.includes(s.id)).map(s => ({ value: s.id, label: sizeLabel(s), description: s.category })))
const spaceName = (id: string | null) => id ? data.value?.spaces.find(s => s.id === id)?.name ?? null : null
const describe = (o: Outlet) => [
  t(`bar.screens.outlets.kinds.${o.kind}`),
  t('bar.screens.outlets.sells-from', { list: o.priceList }),
  spaceName(o.spaceId),
  t(`bar.screens.outlets.layouts.${o.tillLayout}`),
  o.favourites.length ? t('bar.screens.outlets.favourite-count', { count: o.favourites.length }) : null,
].filter(Boolean).join(' · ')

const query = ref('')
const searching = ref(false)
const showRetired = ref(false)
const shown = computed(() => (data.value?.outlets ?? []).filter(o => o.name.toLowerCase().includes(query.value.trim().toLowerCase())))
const current = computed(() => shown.value.filter(o => o.active))
const retired = computed(() => shown.value.filter(o => !o.active))

const form = ref<{ id: string | null, name: string, kind: Kind, priceListId: string, spaceId: string, stockLocationId: string, tillLayout: Layout, favourites: string[] } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useFormRef('formEl')
function edit(o?: Outlet) {
  refusal.value = null
  form.value = o
    ? { id: o.id, name: o.name, kind: o.kind, priceListId: o.priceListId, spaceId: o.spaceId ?? 'none', stockLocationId: o.stockLocationId ?? 'none', tillLayout: o.tillLayout, favourites: [...o.favourites] }
    : { id: null, name: '', kind: 'bar', priceListId: listItems.value[0]?.value ?? '', spaceId: 'none', stockLocationId: data.value?.locations.length === 1 ? data.value.locations[0]!.id : 'none', tillLayout: 'chips', favourites: [] }
}
const outletBody = () => {
  const f = form.value!
  return { name: f.name, kind: f.kind, priceListId: f.priceListId || null, spaceId: f.spaceId === 'none' ? null : f.spaceId, stockLocationId: f.stockLocationId === 'none' ? null : f.stockLocationId, tillLayout: f.tillLayout }
}
async function save() {
  const f = form.value!
  refusal.value = null
  const body = outletBody()
  try {
    let id = f.id
    if (id) await $api(`/api/bar/outlets/${id}` as string, { method: 'PATCH', body })
    else id = (await $api<{ outletId: string }>('/api/bar/outlets', { method: 'POST', body })).outletId
    const before = data.value?.outlets.find(o => o.id === f.id)?.favourites ?? []
    if (f.favourites.join() !== before.join()) await $api(`/api/bar/outlets/${id}/favourites` as string, { method: 'POST', body: { variantIds: f.favourites } })
    toast.add({ title: t('bar.screens.outlets.saved'), color: 'success' })
    form.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setActive(o: Outlet, active: boolean) {
  try {
    await $api(`/api/bar/outlets/${o.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
    offer(active ? t('bar.screens.outlets.restored', { name: o.name }) : t('bar.screens.outlets.retired', { name: o.name }), async () => {
      await $api(`/api/bar/outlets/${o.id}` as string, { method: 'PATCH', body: { active: !active } })
      await refresh()
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.outlets.label')">
    <template
      v-if="may?.setup.outlets"
      #primary
    >
      <div class="flex items-center gap-2">
        <SearchToggle
          v-model="query"
          v-model:open="searching"
          :label="t('bar.screens.outlets.search')"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('bar.screens.outlets.new')"
          :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
          @click="edit()"
        />
      </div>
    </template>
    <DataBoundary
      v-if="may?.setup.outlets"
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template v-if="data">
        <EmptyState
          v-if="!data.outlets.length"
          icon="i-lucide-store"
          :title="t('bar.screens.outlets.empty-title')"
          :description="t('bar.screens.outlets.empty')"
          :action="{ label: t('bar.screens.outlets.new'), icon: 'i-lucide-plus', onClick: () => edit() }"
        />
        <div
          v-else
          class="space-y-4"
        >
          <p
            v-if="!shown.length"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.outlets.no-match') }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('bar.navigation.outlets.label')"
          >
            <RecordListItem
              v-for="o in current"
              :key="o.id"
              :name="o.name"
              :description="describe(o)"
            >
              <RowActions
                :label="t('bar.screens.outlets.actions', { name: o.name })"
                :items="[
                  { label: t('bar.screens.outlets.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(o) },
                  { label: t('bar.screens.outlets.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(o, false) },
                ]"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            :open="showRetired || !!query.trim()"
            :label="t('bar.screens.outlets.retired-list')"
            :count="retired.length"
            @update:open="v => showRetired = v"
          >
            <RecordList :label="t('bar.screens.outlets.retired-list')">
              <RecordListItem
                v-for="o in retired"
                :key="o.id"
                :name="o.name"
                :description="describe(o)"
                muted
              >
                <RowActions
                  :label="t('bar.screens.outlets.actions', { name: o.name })"
                  :items="[
                    { label: t('bar.screens.outlets.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(o) },
                    { label: t('bar.screens.outlets.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(o, true) },
                  ]"
                />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
        </div>
      </template>
    </DataBoundary>

    <BarPriceLists
      v-if="may?.setup.prices"
      @changed="may?.setup.outlets && refresh()"
    />

    <UModal
      :open="!!form"
      :title="form?.id ? t('bar.screens.outlets.edit') : t('bar.screens.outlets.new')"
      @update:open="v => { if (!v) form = null }"
    >
      <template #body>
        <UForm
          v-if="form"
          id="bar-outlet"
          ref="formEl"
          :state="form"
          :validate="() => bodyErrors(form?.id ? outletPatch : outletInput, outletBody())"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.outlets.name')"
            :help="t('bar.screens.outlets.name-help')"
            name="name"
            required
          >
            <UInput v-model="form.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.outlets.kind')"
            :help="t('bar.screens.outlets.kind-help')"
            name="kind"
          >
            <USelect
              v-model="form.kind"
              :items="kindItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.outlets.list')"
            name="priceListId"
          >
            <USelectMenu
              v-model="form.priceListId"
              :items="listItems"
              value-key="value"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.outlets.space')"
            :help="t('bar.screens.outlets.space-help')"
            name="spaceId"
          >
            <USelectMenu
              v-model="form.spaceId"
              :items="spaceItems"
              value-key="value"
            />
          </UFormField>
          <UFormField
            v-if="data?.locations.length"
            :label="t('bar.screens.outlets.stock')"
            :help="t('bar.screens.outlets.stock-help')"
            name="stockLocationId"
          >
            <USelectMenu
              v-model="form.stockLocationId"
              :items="locationItems"
              value-key="value"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.outlets.layout')"
            :help="t('bar.screens.outlets.layout-help')"
            name="tillLayout"
          >
            <USelect
              v-model="form.tillLayout"
              :items="layoutItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.outlets.favourites')"
            :help="t('bar.screens.outlets.favourites-help')"
            name="favourites"
          >
            <USelectMenu
              v-model="form.favourites"
              :items="sizeItems"
              value-key="value"
              multiple
              :placeholder="t('bar.screens.outlets.favourites-none')"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-outlet"
          :loading="formEl?.loading"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
