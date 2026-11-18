<!-- A run's wheelchair spaces, on the production's Tickets tab (Matt 2026-11-17, 21:58): each space's
     usual layout, one layout chosen for the run, or numbers typed in. A performance can have its own
     on its set-up, which this leaves alone. -->
<script setup lang="ts">
import type { z } from 'zod'
import type { wheelchairChoice } from '../../server/input'

type Choice = z.input<typeof wheelchairChoice>
interface Shown {
  layouts: { id: string, name: string, usual: boolean, spaceName: string | null }[]
  choice: { layoutId: string | null, wheelchairSpaces: number | null, seatsPerSpace: number | null } | null
  ownCount: number
}

const props = defineProps<{ productionId: string }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const url = computed(() => `/api/box-office/productions/${encodeURIComponent(props.productionId)}/layout`)
const { data, refresh } = await useAPI<Shown>(url, { key: `box-office:run-layout:${props.productionId}` })

const current = computed<Choice>(() => {
  const c = data.value?.choice
  if (!c) return { use: 'inherit' }
  return c.layoutId ? { use: 'layout', layoutId: c.layoutId } : { use: 'numbers', wheelchairSpaces: c.wheelchairSpaces ?? 0, seatsPerSpace: c.seatsPerSpace ?? 0 }
})
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function use(choice: Choice) {
  await $api(url.value, { method: 'PUT', body: choice })
  await refresh()
  emit('changed')
}
async function save(choice: Choice) {
  const before = current.value
  refusal.value = null
  try {
    await use(choice)
    offer(t('box-office.layouts.choice.saved'), () => use(before))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageSection
    v-if="data"
    :title="t('box-office.layouts.run.title')"
    :description="data.ownCount ? t('box-office.layouts.run.own', { count: data.ownCount }) : t('box-office.layouts.run.description')"
  >
    <div class="space-y-4">
      <RefusalNotice :refusal="refusal" />
      <BoxOfficeWheelchairChoice
        :layouts="data.layouts"
        :current="current"
        :inherit-label="t('box-office.layouts.choice.usual')"
        :inherit-description="t('box-office.layouts.choice.usual-description')"
        @save="save"
      />
    </div>
  </PageSection>
</template>
