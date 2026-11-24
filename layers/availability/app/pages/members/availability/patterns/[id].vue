<!-- One weekly pattern (S2): its name and dates, and its typical week painted on the same grid as My
     availability. Nothing is saved until "Save pattern"; leaving with changes asks first. -->
<script setup lang="ts">
import { repaint, type Line } from '../../../../../shared/grid'
import { LEVELS } from '../../../../../shared/levels'
import { typicalDates, typicalWeek } from '../../../../composables/usePatterns'
import type { Tool } from '../../../../composables/useMyAvailability'

const route = useRoute()
const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await usePatterns()
const LABEL_MAX = 40 // not-policy: as the table's CHECK

const id = computed(() => String(route.params.id))
const pattern = computed(() => data.value?.patterns.find(p => p.id === id.value) ?? null)
const form = reactive({ label: '', startsOn: '', endsOn: null as string | null, lines: [] as Line[] })
const saved = ref('')
const snapshot = () => JSON.stringify(form)
watch(pattern, (p) => {
  if (!p) return
  Object.assign(form, { label: p.label, startsOn: p.startsOn, endsOn: p.endsOn, lines: p.lines.map(l => ({ ...l })) })
  saved.value = snapshot()
}, { immediate: true })
const dirty = computed(() => !!saved.value && snapshot() !== saved.value)
useLeaveGuard(dirty)

const tool = ref<Tool>('busy')
const TOOLS = computed(() => [...LEVELS, 'clear' as const].map(value => ({ value, label: t(`availability.tools.${value}`) })))
const headings = computed(() => Object.fromEntries(typicalDates.map((date, i) => [date, t(`availability.weekdays.${i + 1}`)])))
const week = computed(() => typicalWeek(form.lines))

function paint(stroke: { date: string, start: number, end: number }) {
  form.lines = repaint(form.lines, typicalDates.indexOf(stroke.date) + 1, { start: stroke.start, end: stroke.end }, tool.value)
}

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function save() {
  refusal.value = null
  try {
    await $api(`/api/availability/patterns/${id.value}`, { method: 'PUT', body: { label: form.label.trim(), startsOn: form.startsOn, endsOn: form.endsOn || null, lines: form.lines } })
    saved.value = snapshot()
    toast.add({ title: t('availability.patterns.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="pattern?.label ?? t('availability.patterns.title')"
    :description="t('availability.patterns.edit-help')"
    width="full"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }, { label: t('availability.patterns.title'), to: '/members/availability/patterns' }]"
  >
    <template #primary>
      <UButton
        :label="t('availability.patterns.save')"
        :disabled="!dirty"
        loading-auto
        @click="save"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!pattern"
          icon="i-lucide-repeat"
          :title="t('availability.patterns.not-found')"
          :action="{ label: t('availability.patterns.title'), to: '/members/availability/patterns' }"
        />
        <div
          v-else
          class="space-y-6"
        >
          <div class="flex flex-wrap items-end gap-4">
            <UFormField
              :label="t('availability.patterns.label')"
              required
            >
              <UInput
                v-model="form.label"
                :maxlength="LABEL_MAX"
                class="w-64"
              />
            </UFormField>
            <UFormField
              :label="t('availability.patterns.starts')"
              required
            >
              <FieldDate v-model="form.startsOn" />
            </UFormField>
            <UFormField
              :label="t('availability.patterns.ends')"
              :hint="t('availability.entry.optional')"
            >
              <FieldDate
                v-model="form.endsOn"
                :min="form.startsOn"
              />
            </UFormField>
          </div>
          <RefusalNotice :refusal="refusal" />
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-3">
              <UFormField
                :label="t('availability.mine.paint')"
                orientation="horizontal"
              >
                <UTabs
                  v-model="tool"
                  :items="TOOLS"
                  :content="false"
                  size="sm"
                />
              </UFormField>
              <p class="text-sm text-muted">
                {{ t('availability.patterns.how') }}
              </p>
            </div>
            <AvailabilityWeekGrid
              :days="week"
              :step="d.grid.step"
              :day-starts="d.grid.dayStarts"
              :today="d.today"
              :horizon="d.horizon"
              :headings="headings"
              @paint="paint"
            />
          </div>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
