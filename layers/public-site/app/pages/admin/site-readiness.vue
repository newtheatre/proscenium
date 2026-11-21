<!-- Site readiness (C-42; core domain specification, part 6): a checklist of what the public site
     still lacks. Pages still holding starter text, missing brand items, images with no text
     description, components whose module is off, quoted settings still unset, venues with no access
     recorded and productions left unfinished. Each line links to where it is put right, or names the
     file to edit. Search engines are turned away until the theatre says the site is ready, with the
     button on the notice at the top (Matt, 21 November 2026: the switch sits where the warning is).
     Needs public-site.readiness.view. -->
<script setup lang="ts">
import type { SiteReadiness } from '../../../server/readiness'

interface Line { id: string, name: string, description: string, to?: string }
interface Section { id: string, lines: Line[] }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const HIDDEN = 'public-site.search.hidden'
// Whether this person may let search engines in: the setting's own answer, so the button and the server agree.
const { data: own } = await useAPI<{ settings: { key: string, canChange: boolean }[] }>('/api/core/settings', { query: { screen: '/admin/site-readiness' }, key: 'public-site:readiness:settings' })
const mayChange = computed(() => !!own.value?.settings.find(s => s.key === HIDDEN)?.canChange)

async function set(hidden: boolean) {
  await $api(`/api/core/settings/${HIDDEN}` as string, { method: 'PUT', body: { value: hidden, confirm: true } })
  await refresh()
}
async function change(hidden: boolean) {
  const left = data.value?.outstanding ?? 0
  const sure = await confirm(hidden
    ? { verb: t('public-site.readiness.hide.verb'), thing: t('public-site.readiness.hide.thing'), consequence: t('public-site.readiness.hide.consequence'), button: t('public-site.readiness.hide.button') }
    : { verb: t('public-site.readiness.show.verb'), thing: t('public-site.readiness.show.thing'), consequence: left ? t('public-site.readiness.show.consequence-outstanding', { count: left }) : t('public-site.readiness.show.consequence'), button: t('public-site.readiness.show.button'), tone: 'primary' })
  if (!sure) return
  refusal.value = null
  try {
    await set(hidden)
    offer(t(hidden ? 'public-site.readiness.hide.done' : 'public-site.readiness.show.done'), () => set(!hidden))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const notice = computed(() => {
  const hidden = !!data.value?.hidden
  return mayChange.value
    ? [{ label: t(hidden ? 'public-site.readiness.show.button' : 'public-site.readiness.hide.button'), color: 'neutral' as const, variant: 'outline' as const, onClick: () => { void change(!hidden) } }]
    : undefined
})
const { nameOf } = useModuleWords()
const { data, status, error, refresh } = await useAPI<SiteReadiness>('/api/public-site/readiness', { key: 'public-site:readiness' })

const settingLabel = (key: string) => {
  const dot = key.indexOf('.')
  const label = `${key.slice(0, dot)}.settings.${key.slice(dot + 1)}.label`
  return te(label) ? t(label) : key
}

const sections = computed<Section[]>(() => {
  const r = data.value
  if (!r) return []
  return [
    { id: 'pages', lines: r.pages.map(p => ({ id: p.path, name: p.name, description: t('public-site.readiness.pages.line', { file: p.file }), to: p.path })) },
    { id: 'brand', lines: r.brand.map(b => ({ id: b.item, name: t(`public-site.readiness.brand.${b.item}`), description: t(`public-site.readiness.brand.${b.item}-help`), to: b.to })) },
    {
      id: 'images',
      lines: [
        ...r.images.map((i, n) => ({ id: `${i.item}-${n}`, name: i.name ?? t(`public-site.readiness.images.${i.item}`), description: t(`public-site.readiness.images.${i.item}-help`), to: i.to })),
        ...r.pageImages.map((i, n) => ({ id: `page-${n}`, name: i.name, description: t('public-site.readiness.images.page-help', { src: i.src, file: i.file }) })),
      ],
    },
    { id: 'components', lines: r.components.map(c => ({ id: `${c.path}:${c.tag}`, name: c.name, description: t('public-site.readiness.components.line', { tag: c.tag, module: nameOf(c.module), file: c.file }), to: `/admin/modules/${c.module}` })) },
    { id: 'settings', lines: r.settings.map(s => ({ id: `${s.path}:${s.key}`, name: settingLabel(s.key), description: t('public-site.readiness.settings.line', { page: s.name }), to: s.to })) },
    {
      id: 'policies',
      lines: r.policies.map((p, n) => ({
        id: `${p.kind}-${n}`,
        name: p.kind === 'setting' ? settingLabel(p.key ?? '') : p.name,
        description: t(`public-site.readiness.policies.${p.kind}`, { file: p.file ?? '' }),
        to: p.to,
      })),
    },
    { id: 'venues', lines: r.venues.map(v => ({ id: v.to, name: v.name ?? '', description: t('public-site.readiness.venues.line'), to: v.to })) },
    {
      id: 'productions',
      lines: [
        ...r.levelsAssumed.map(p => ({ id: `level:${p.to}`, name: p.name ?? '', description: t('public-site.readiness.productions.level-assumed'), to: p.to })),
        ...r.effectsUnanswered.map(p => ({ id: `effects:${p.to}`, name: p.name ?? '', description: t('public-site.readiness.productions.effects-unanswered'), to: p.to })),
      ],
    },
  ]
})
// What still needs doing comes first; what is finished folds into one short list beneath.
const outstanding = computed(() => sections.value.filter(s => s.lines.length))
const finished = computed(() => sections.value.filter(s => !s.lines.length))
</script>

<template>
  <PageFrame
    :title="t('public-site.navigation.readiness.label')"
    :description="t('public-site.readiness.description')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-8"
      >
        <UAlert
          :color="data.hidden ? 'warning' : 'success'"
          variant="subtle"
          :icon="data.hidden ? 'i-lucide-eye-off' : 'i-lucide-search-check'"
          :title="t(data.hidden ? 'public-site.readiness.hidden.title' : 'public-site.readiness.visible.title')"
          :description="t(data.hidden ? (data.outstanding ? 'public-site.readiness.hidden.outstanding' : 'public-site.readiness.hidden.ready') : 'public-site.readiness.visible.description')"
          :actions="notice"
        />
        <RefusalNotice :refusal="refusal" />
        <section
          v-for="section in outstanding"
          :key="section.id"
          :aria-labelledby="`readiness-${section.id}`"
          class="space-y-3"
        >
          <div class="flex items-center justify-between gap-3">
            <h2
              :id="`readiness-${section.id}`"
              class="text-base font-semibold text-highlighted"
            >
              {{ t(`public-site.readiness.${section.id}.title`) }}
            </h2>
            <StatusBadge
              tone="warning"
              :label="t('public-site.readiness.to-do', { count: section.lines.length })"
            />
          </div>
          <RecordList :label="t(`public-site.readiness.${section.id}.title`)">
            <RecordListItem
              v-for="line in section.lines"
              :key="line.id"
              :name="line.name"
              :description="line.description"
              :to="line.to"
            />
          </RecordList>
        </section>
        <section
          v-if="finished.length"
          aria-labelledby="readiness-finished"
          class="space-y-3"
        >
          <h2
            id="readiness-finished"
            class="text-base font-semibold text-highlighted"
          >
            {{ t('public-site.readiness.finished') }}
          </h2>
          <RecordList :label="t('public-site.readiness.finished')">
            <RecordListItem
              v-for="section in finished"
              :key="section.id"
              icon="i-lucide-check"
              :name="t(`public-site.readiness.${section.id}.title`)"
              :description="t(`public-site.readiness.${section.id}.none`)"
            />
          </RecordList>
        </section>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
