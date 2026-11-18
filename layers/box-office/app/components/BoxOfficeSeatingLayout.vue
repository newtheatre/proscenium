<!-- A performance's seating layout (show walkthrough, decision 10), on its set-up: the layout it
     uses, which is its space's usual one unless someone chooses another here, and how its wheelchair
     spaces stand: booked, the seats each takes, and the seats kept back for those not yet booked. -->
<script setup lang="ts">
interface Layout { id: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, usual: boolean }
interface Shown {
  layouts: Layout[]
  layoutId: string | null
  wheelchair: { spaces: number, booked: number, seatsEach: number, section: string | null, kept: number, keepUntil: number | null } | null
}

const props = defineProps<{ performanceId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { dateTime } = useDates()
const url = computed(() => `/api/box-office/performances/${encodeURIComponent(props.performanceId)}/layout`)
const { data, refresh } = await useAPI<Shown>(url, { key: `box-office:layout:${props.performanceId}` })

const chosen = ref<string | undefined>(undefined)
watch(data, (d) => {
  chosen.value = d?.layoutId ?? undefined
}, { immediate: true })
const items = computed(() => (data.value?.layouts ?? []).map(l => ({ value: l.id, label: l.usual ? t('box-office.layouts.usual-name', { name: l.name }) : l.name })))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function use(id: string) {
  await $api(url.value, { method: 'PUT', body: { layoutId: id } })
  await refresh()
  emit('changed')
}
async function save() {
  const id = chosen.value
  if (!id) return
  const before = data.value?.layoutId
  refusal.value = null
  try {
    await use(id)
    const name = data.value?.layouts.find(l => l.id === id)?.name ?? ''
    offer(t('box-office.layouts.chosen', { name }), before ? () => use(before) : undefined)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const facts = computed(() => {
  const w = data.value?.wheelchair
  if (!w) return []
  return [
    { label: t('box-office.layouts.fact.spaces'), value: t('box-office.layouts.fact.booked', { booked: w.booked, spaces: w.spaces }) },
    { label: t('box-office.layouts.fact.each'), value: w.seatsEach ? t('box-office.layouts.seats', { count: w.seatsEach }) : t('box-office.layouts.fact.apart') },
    ...(w.seatsEach && w.keepUntil
      ? [{ label: t('box-office.layouts.fact.kept'), value: w.kept ? t('box-office.layouts.fact.kept-until', { seats: t('box-office.layouts.seats', { count: w.kept }), when: dateTime(w.keepUntil) }) : t('box-office.layouts.fact.none-kept') }]
      : []),
  ]
})
</script>

<template>
  <PageSection
    v-if="data"
    :title="t('box-office.layouts.performance.title')"
    :description="data.layouts.length ? t('box-office.layouts.performance.description') : t('box-office.layouts.performance.none')"
  >
    <template
      v-if="!data.layouts.length"
      #actions
    >
      <UButton
        :label="t('box-office.layouts.performance.manage')"
        to="/admin/modules/box-office/seating-layouts"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </template>
    <div
      v-if="data.layouts.length"
      class="space-y-4"
    >
      <RefusalNotice :refusal="refusal" />
      <UForm
        :state="{ layoutId: chosen }"
        class="flex flex-wrap items-end gap-2"
        novalidate
        @submit="save"
      >
        <UFormField
          :label="t('box-office.layouts.performance.layout')"
          name="layoutId"
          class="grow"
        >
          <USelect
            v-model="chosen"
            :items="items"
            :placeholder="t('box-office.layouts.performance.placeholder')"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="outline"
          :label="t('box-office.layouts.performance.use')"
          :disabled="!chosen || chosen === data.layoutId"
        />
      </UForm>
      <FactStrip
        v-if="facts.length"
        :facts="facts"
      />
    </div>
  </PageSection>
</template>
