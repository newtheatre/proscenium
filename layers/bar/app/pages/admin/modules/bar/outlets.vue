<!-- Outlets (S13): the places that sell, such as the foyer bar or an interval kiosk, each with the
     price list it sells from and where it is. One outlet at most is the box office desk. An outlet
     that has sold is retired, not deleted. -->
<script setup lang="ts">
type Kind = 'bar' | 'kiosk' | 'desk'
interface Outlet { id: string, name: string, kind: Kind, priceListId: string, priceList: string, spaceId: string | null, active: boolean }
interface Option { id: string, name: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ outlets: Outlet[], lists: Option[], spaces: Option[] }>('/api/bar/outlets', { key: 'bar:outlets' })

const kindItems = computed(() => (['bar', 'kiosk', 'desk'] as const).map(k => ({ value: k, label: t(`bar.screens.outlets.kinds.${k}`) })))
const listItems = computed(() => (data.value?.lists ?? []).map(l => ({ value: l.id, label: l.name })))
const spaceItems = computed(() => [{ value: 'none', label: t('bar.screens.outlets.no-space') }, ...(data.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name }))])
const spaceName = (id: string | null) => id ? data.value?.spaces.find(s => s.id === id)?.name ?? null : null
const describe = (o: Outlet) => [t(`bar.screens.outlets.kinds.${o.kind}`), t('bar.screens.outlets.sells-from', { list: o.priceList }), spaceName(o.spaceId)].filter(Boolean).join(' · ')

const form = ref<{ id: string | null, name: string, kind: Kind, priceListId: string, spaceId: string } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function edit(o?: Outlet) {
  refusal.value = null
  form.value = o
    ? { id: o.id, name: o.name, kind: o.kind, priceListId: o.priceListId, spaceId: o.spaceId ?? 'none' }
    : { id: null, name: '', kind: 'bar', priceListId: listItems.value[0]?.value ?? '', spaceId: 'none' }
}
async function save() {
  const f = form.value!
  refusal.value = null
  const body = { name: f.name, kind: f.kind, priceListId: f.priceListId || null, spaceId: f.spaceId === 'none' ? null : f.spaceId }
  try {
    if (f.id) await $api(`/api/bar/outlets/${f.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/outlets', { method: 'POST', body })
    toast.add({ title: t('bar.screens.outlets.saved'), color: 'success' })
    form.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function setActive(o: Outlet, active: boolean) {
  try {
    await $api(`/api/bar/outlets/${o.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.outlets.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.outlets.new')"
        @click="edit()"
      />
    </template>
    <DataBoundary
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
        />
        <RecordList
          v-else
          :label="t('bar.navigation.outlets.label')"
        >
          <RecordListItem
            v-for="o in data.outlets"
            :key="o.id"
            :name="o.active ? o.name : t('bar.screens.products.retired-name', { name: o.name })"
            :description="describe(o)"
            :muted="!o.active"
          >
            <RowActions
              :label="t('bar.screens.outlets.actions', { name: o.name })"
              :items="[
                { label: t('bar.screens.outlets.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(o) },
                o.active
                  ? { label: t('bar.screens.outlets.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(o, false) }
                  : { label: t('bar.screens.outlets.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(o, true) },
              ]"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </DataBoundary>

    <UModal
      :open="!!form"
      :title="form?.id ? t('bar.screens.outlets.edit') : t('bar.screens.outlets.new')"
      @update:open="v => { if (!v) form = null }"
    >
      <template #body>
        <UForm
          v-if="form"
          id="bar-outlet"
          :state="form"
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
            <USelect
              v-model="form.priceListId"
              :items="listItems"
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
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-outlet"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
