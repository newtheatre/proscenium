<script setup lang="ts">
// What the audience is told before they come (C-10, C-53): who the production is for, the staging
// effects the room will use, and the content warnings, each graded by how much of the topic the show
// holds. Effects and age are always shown on the public page; content warnings sit behind a "show".
// The tab is one form with one Save; leaving it with changes asks first.
type Level = 'mentioned' | 'discussed' | 'depicted'
interface Heading { id: string, label: string }
interface Warning { id: string, label: string, description: string | null, groupId: string | null, retired: boolean }
interface EffectOption { id: string, label: string, description: string | null, icon: string | null, retired: boolean }
interface Guidance {
  ageMin: number | null
  ageRestricted: boolean
  effectsConfirmedNone: boolean
  advisoriesConfirmedNone: boolean
  advisories: { termId: string, level: Level, levelAssumed: boolean, detail: string | null }[]
  effects: { termId: string, detail: string | null }[]
}
interface Options { advisories: Warning[], advisoryGroups: Heading[], effects: EffectOption[] }

const props = defineProps<{ productionId: string, production: Guidance, options: Options }>()
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const base = computed(() => `/api/core/productions/${props.productionId}`)

// ---- Age
const NO_AGE = -1
const ages = [{ value: NO_AGE, label: 'No age set' }, ...Array.from({ length: 22 }, (_, n) => ({ value: n, label: n === 0 ? 'All ages' : `${n} and over` }))]
const KINDS = [{ value: 'recommendation', label: 'A recommendation' }, { value: 'restriction', label: 'A restriction: nobody younger is admitted' }]
const age = reactive({ min: NO_AGE, kind: 'recommendation' })

// ---- Staging effects
const effectsOn = reactive<Record<string, { on: boolean, detail: string }>>({})
const effectsNone = ref(false)
const shownEffects = computed(() => props.options.effects.filter(e => !e.retired || effectsOn[e.id]?.on))
const anyEffect = computed(() => shownEffects.value.some(e => effectsOn[e.id]?.on))

// ---- Content warnings
const LEVELS = [{ value: 'mentioned', label: 'Mentioned' }, { value: 'discussed', label: 'Discussed' }, { value: 'depicted', label: 'Depicted' }]
const LEVEL_HELP = 'Mentioned: said in passing. Discussed: talked about at length. Depicted: shown on stage.'
const picked = reactive<Record<string, { on: boolean, level: Level | '', detail: string, assumed: boolean }>>({})
const warningsNone = ref(false)
const search = ref('')

// The form starts from what is saved, and starts again from it after each save.
function reset() {
  const p = props.production
  age.min = p.ageMin ?? NO_AGE
  age.kind = p.ageRestricted ? 'restriction' : 'recommendation'
  for (const e of props.options.effects) {
    const row = p.effects.find(x => x.termId === e.id)
    effectsOn[e.id] = { on: !!row, detail: row?.detail ?? '' }
  }
  effectsNone.value = p.effectsConfirmedNone
  for (const w of props.options.advisories) {
    const row = p.advisories.find(x => x.termId === w.id)
    picked[w.id] = { on: !!row, level: row && !row.levelAssumed ? row.level : '', detail: row?.detail ?? '', assumed: !!row?.levelAssumed }
  }
  warningsNone.value = p.advisoriesConfirmedNone
  attempted.value = false
}
const attempted = ref(false)
watch(() => [props.production, props.options] as const, reset, { immediate: true, deep: true })

const OTHER = '__other'
const headings = computed(() => [...props.options.advisoryGroups, { id: OTHER, label: 'Other' }])
const headingOf = (w: Warning) => headings.value.find(h => h.id === (w.groupId ?? OTHER))?.label ?? ''
const chosen = computed(() => props.options.advisories.filter(w => picked[w.id]?.on))
const ungraded = computed(() => chosen.value.filter(w => !picked[w.id]!.level))
const needle = computed(() => search.value.trim())
// Every warning under its heading, folded until opened; a search opens the headings it matches.
const sections = computed(() => {
  const visible = props.options.advisories.filter(w => (!w.retired || picked[w.id]?.on) && warningMatches(w, headingOf(w), needle.value))
  return headings.value
    .map(h => ({ label: h.label, value: h.id, terms: visible.filter(w => (w.groupId ?? OTHER) === h.id) }))
    .filter(h => h.terms.length)
})
const opened = ref<string[]>([])
const openHeadings = computed(() => (needle.value ? sections.value.map(h => h.value) : opened.value))
const chosenIn = (terms: Warning[]) => terms.filter(w => picked[w.id]?.on).length

const setAll = ref<string | undefined>(undefined)
function applySetAll(level: string | undefined) {
  if (!level) return
  for (const w of chosen.value) picked[w.id]!.level = level as Level
  setAll.value = undefined
}

// ---- What would be saved, compared with what is, so Save sends only the parts that changed.
const byTerm = <T extends { termId: string }>(list: T[]) => [...list].sort((a, b) => a.termId.localeCompare(b.termId))
const effectList = computed(() => shownEffects.value.filter(e => effectsOn[e.id]?.on).map(e => ({ termId: e.id, detail: effectsOn[e.id]!.detail.trim() || null })))
const warningList = computed(() => chosen.value.map(w => ({ termId: w.id, level: picked[w.id]!.level, detail: picked[w.id]!.detail.trim() || null })))
const ageNow = computed(() => ({ ageMin: age.min === NO_AGE ? null : age.min, ageRestricted: age.min !== NO_AGE && age.kind === 'restriction' }))
const ageDirty = computed(() => ageNow.value.ageMin !== props.production.ageMin || ageNow.value.ageRestricted !== props.production.ageRestricted)
const effectsDirty = computed(() => JSON.stringify(byTerm(effectList.value)) !== JSON.stringify(byTerm(props.production.effects.map(e => ({ termId: e.termId, detail: e.detail })))))
const warningsDirty = computed(() => JSON.stringify(byTerm(warningList.value)) !== JSON.stringify(byTerm(props.production.advisories.map(a => ({ termId: a.termId, level: a.levelAssumed ? '' : a.level, detail: a.detail })))))
// "None" means something only while nothing is listed.
const effectsNoneNow = computed(() => !effectList.value.length && effectsNone.value)
const warningsNoneNow = computed(() => !warningList.value.length && warningsNone.value)
const noneDirty = computed(() => effectsNoneNow.value !== (props.production.effectsConfirmedNone && !props.production.effects.length)
  || warningsNoneNow.value !== (props.production.advisoriesConfirmedNone && !props.production.advisories.length))
const dirty = computed(() => ageDirty.value || effectsDirty.value || warningsDirty.value || noneDirty.value)

useLeaveGuard(dirty, { query: ['tab'], thing: 'this tab' })

const saving = ref(false)
async function save() {
  attempted.value = true
  if (ungraded.value.length) {
    // The first warning without a level, where the person can give it one.
    await nextTick()
    document.getElementById(`level-${ungraded.value[0]!.id}`)?.focus()
    return
  }
  if (!dirty.value) {
    attempted.value = false
    return
  }
  refusal.value = null
  saving.value = true
  // "None" is confirmed before an emptied list is sent, so a published production always keeps an answer.
  const first: Record<string, unknown> = ageDirty.value ? { ...ageNow.value } : {}
  if (effectsNoneNow.value && !props.production.effectsConfirmedNone) first.effectsConfirmedNone = true
  if (warningsNoneNow.value && !props.production.advisoriesConfirmedNone) first.advisoriesConfirmedNone = true
  const last: Record<string, unknown> = {}
  if (!effectsNoneNow.value && !effectList.value.length && props.production.effectsConfirmedNone) last.effectsConfirmedNone = false
  if (!warningsNoneNow.value && !warningList.value.length && props.production.advisoriesConfirmedNone) last.advisoriesConfirmedNone = false
  try {
    if (Object.keys(first).length) await $api(base.value, { method: 'PATCH', body: first })
    if (effectsDirty.value) await $api(`${base.value}/effects`, { method: 'PUT', body: { effects: effectList.value } })
    if (warningsDirty.value) await $api(`${base.value}/advisories`, { method: 'PUT', body: { advisories: warningList.value } })
    if (Object.keys(last).length) await $api(base.value, { method: 'PATCH', body: last })
    attempted.value = false
    emit('changed')
    toast.add({ title: 'Age, effects and warnings saved', color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm
    id="production-guidance"
    :state="age"
    class="space-y-4"
    novalidate
    @submit="save"
  >
    <RefusalNotice :refusal="refusal" />

    <PageSection
      title="Who it is for"
      description="A minimum age shows on the production's page and on its cards. A recommendation advises; a restriction means nobody younger is admitted."
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Minimum age">
          <USelectMenu
            v-model="age.min"
            :items="ages"
            value-key="value"
            :search-input="false"
          />
        </UFormField>
        <UFormField
          label="This age is"
          :help="age.min === NO_AGE ? 'Set an age first.' : undefined"
        >
          <USelect
            v-model="age.kind"
            :items="KINDS"
            :disabled="age.min === NO_AGE"
          />
        </UFormField>
      </div>
    </PageSection>

    <PageSection
      title="Staging effects"
      description="What the room will do to the audience. This is safety information, so it is always shown. List the effects, or confirm there are none: publishing needs one or the other."
    >
      <div class="space-y-3">
        <div
          v-for="e in shownEffects"
          :key="e.id"
          class="flex flex-wrap items-center gap-3"
        >
          <UCheckbox
            v-model="effectsOn[e.id]!.on"
            :label="e.label"
            :description="e.description ?? undefined"
            class="w-full sm:w-72"
          />
          <UInput
            v-if="effectsOn[e.id]!.on"
            v-model="effectsOn[e.id]!.detail"
            placeholder="Detail, such as when it happens"
            :aria-label="`Detail for ${e.label}`"
            maxlength="300"
            size="sm"
            class="min-w-48 flex-1"
          />
        </div>
        <UCheckbox
          v-if="!anyEffect"
          v-model="effectsNone"
          label="This production has no staging effects to warn about"
        />
      </div>
    </PageSection>

    <PageSection
      title="Content warnings"
      description="What the story is about that someone may want to know first. Grade each by how much of it the show holds. They sit behind a &quot;show&quot; control on the public page, because they can spoil the plot. List them, or confirm there are none."
    >
      <!-- What is chosen comes first, with its level and detail, so the long list below can stay folded. -->
      <div
        v-if="chosen.length"
        class="space-y-3"
      >
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h3 class="text-sm font-semibold text-highlighted">
            Chosen ({{ chosen.length }})
          </h3>
          <UFormField
            v-if="chosen.length > 1"
            label="Set all chosen to"
          >
            <USelect
              v-model="setAll"
              :items="LEVELS"
              placeholder="Choose a level"
              class="w-44"
              @update:model-value="applySetAll"
            />
          </UFormField>
        </div>
        <p class="text-sm text-muted">
          {{ LEVEL_HELP }}
        </p>
        <RecordList label="Chosen content warnings">
          <RecordListItem
            v-for="w in chosen"
            :key="w.id"
            :name="w.label"
          >
            <template #leading>
              <UCheckbox
                v-model="picked[w.id]!.on"
                :aria-label="`${w.label}: chosen`"
              />
            </template>
            <UBadge
              v-if="picked[w.id]!.assumed"
              color="warning"
              variant="subtle"
              label="Level assumed: set the real one"
            />
            <UFormField
              :name="`level-${w.id}`"
              :error="attempted && !picked[w.id]!.level ? 'Choose a level' : undefined"
              class="w-40"
            >
              <USelect
                :id="`level-${w.id}`"
                v-model="picked[w.id]!.level"
                :items="LEVELS"
                placeholder="Choose a level"
                :aria-label="`Level for ${w.label}`"
                size="sm"
              />
            </UFormField>
            <template #below>
              <UInput
                v-model="picked[w.id]!.detail"
                placeholder="Detail, such as when it happens"
                :aria-label="`Detail for ${w.label}`"
                maxlength="300"
                size="sm"
              />
            </template>
          </RecordListItem>
        </RecordList>
      </div>

      <UFormField
        label="Find a warning"
        help="Searches each warning's name and description, so a word like &quot;gun&quot; or &quot;swearing&quot; finds it."
      >
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search the list"
        />
      </UFormField>
      <p
        v-if="needle && !sections.length"
        role="status"
        class="text-sm text-muted"
      >
        No warning matches “{{ needle }}”. Try another word, or ask an administrator to add it to the list.
      </p>
      <UAccordion
        type="multiple"
        :items="sections"
        :model-value="openHeadings"
        @update:model-value="opened = Array.isArray($event) ? $event : []"
      >
        <template #default="{ item }">
          <span class="font-medium text-highlighted">{{ item.label }}</span>
          <span class="ms-auto me-2 text-sm font-normal text-muted">
            {{ chosenIn(item.terms) ? `${chosenIn(item.terms)} of ${item.terms.length} chosen` : item.terms.length }}
          </span>
        </template>
        <template #body="{ item }">
          <div class="grid gap-3 sm:grid-cols-2">
            <UCheckbox
              v-for="w in item.terms"
              :key="w.id"
              v-model="picked[w.id]!.on"
              :label="w.label"
              :description="w.description ?? undefined"
            />
          </div>
        </template>
      </UAccordion>
      <UCheckbox
        v-if="!chosen.length"
        v-model="warningsNone"
        label="This production has no content warnings"
      />
    </PageSection>

    <!-- One Save for the whole tab, kept in view while the long list scrolls. -->
    <div class="sticky-bar flex flex-wrap items-center justify-end gap-3">
      <p
        v-if="attempted && ungraded.length"
        role="alert"
        class="me-auto text-sm text-error"
      >
        Give {{ ungraded.length === 1 ? 'the warning' : `all ${ungraded.length} warnings` }} marked above a level first.
      </p>
      <p
        v-else-if="dirty"
        class="me-auto text-sm text-muted"
      >
        You have changes that have not been saved.
      </p>
      <UButton
        v-if="dirty"
        label="Discard changes"
        color="neutral"
        variant="ghost"
        @click="reset()"
      />
      <UButton
        type="submit"
        label="Save"
        :loading="saving"
      />
    </div>
  </UForm>
</template>
