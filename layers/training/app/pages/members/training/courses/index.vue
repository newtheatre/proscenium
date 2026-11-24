<!-- M2 Courses (training-records part 5; amended part 5): live courses with their ways to learn and
     the person's own status. Filtered by a way to learn, or to the ones not yet held. -->
<script setup lang="ts">
import type { CatalogueRow } from '../../../../../server/learner'
import { WAYS } from '../../../../../shared/states'

const { t } = useT()
const { ways } = useTrainingWords()
const route = useRoute()
const router = useRouter()
const { data, status, error, refresh } = await useAPI<{ courses: CatalogueRow[] }>('/api/training/catalogue', { key: 'training:catalogue' })

// The filters are in the address, so a filtered list is a link and Back returns to it.
const way = computed({
  get: () => (WAYS as readonly string[]).includes(String(route.query.way)) ? String(route.query.way) : 'any',
  set: v => router.replace({ query: { ...route.query, way: v === 'any' ? undefined : v } }),
})
const notHeld = computed({
  get: () => route.query.held === 'no',
  set: v => router.replace({ query: { ...route.query, held: v ? 'no' : undefined } }),
})
const wayItems = computed(() => [{ value: 'any', label: t('training.courses.any-way') }, ...WAYS.map(w => ({ value: w, label: t(`training.ways.${w}`) }))])
const HELD = new Set(['current', 'expiring', 'ends-early'])
const shown = computed(() => (data.value?.courses ?? []).filter(c =>
  (way.value === 'any' || c.ways.includes(way.value as CatalogueRow['ways'][number]))
  && (!notHeld.value || !HELD.has(c.mine?.status ?? 'not-started'))))
const trail = computed(() => [{ label: t('training.navigation.home.label'), to: '/members/training' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="t('training.courses.title')"
        :trail="trail"
      >
        <EmptyState
          v-if="!d.courses.length"
          :title="t('training.courses.empty.title')"
          :description="t('training.courses.empty.description')"
          icon="i-lucide-graduation-cap"
        />
        <div
          v-else
          class="space-y-4"
        >
          <div class="flex flex-wrap items-end gap-4">
            <UFormField :label="t('training.courses.way')">
              <USelect
                v-model="way"
                :items="wayItems"
                class="min-w-48"
              />
            </UFormField>
            <USwitch
              v-model="notHeld"
              :label="t('training.courses.not-held')"
            />
          </div>
          <p
            v-if="!shown.length"
            class="text-muted"
          >
            {{ t('training.courses.none-match') }}
          </p>
          <RecordList
            v-else
            :label="t('training.courses.title')"
          >
            <RecordListItem
              v-for="c in shown"
              :key="c.id"
              :to="`/members/training/courses/${encodeURIComponent(c.slug)}`"
              icon="i-lucide-graduation-cap"
              :name="c.title"
              :description="[ways(c.ways), c.summary].filter(Boolean).join(' · ')"
            >
              <TrainingStatusBadge
                v-if="c.mine && c.mine.status !== 'not-started'"
                :status="c.mine.status"
                :done="c.mine.done"
                :of="c.mine.of"
              />
            </RecordListItem>
          </RecordList>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
