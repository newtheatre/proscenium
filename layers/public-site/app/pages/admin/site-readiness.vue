<!-- Site readiness (C-42; core domain specification, part 6): a checklist of what the public site
     still lacks. Pages still holding starter text, missing brand items, images with no text
     description, components whose module is off, quoted settings still unset, venues with no access
     recorded and productions left unfinished. Each line links to where it is put right, or names the
     file to edit. Search engines are turned away until the theatre says the site is ready, here.
     Needs public-site.readiness.view. -->
<script setup lang="ts">
import type { SiteReadiness } from '../../../server/readiness'

interface Line { id: string, name: string, description: string, to?: string }
interface Section { id: string, lines: Line[] }

const { t, te } = useT()
const route = useRoute()
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
        />
        <section
          v-for="section in sections"
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
              :tone="section.lines.length ? 'warning' : 'success'"
              :label="section.lines.length ? t('public-site.readiness.to-do', { count: section.lines.length }) : t('public-site.readiness.done')"
            />
          </div>
          <RecordList
            v-if="section.lines.length"
            :label="t(`public-site.readiness.${section.id}.title`)"
          >
            <RecordListItem
              v-for="line in section.lines"
              :key="line.id"
              :name="line.name"
              :description="line.description"
              :to="line.to"
            />
          </RecordList>
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ t(`public-site.readiness.${section.id}.none`) }}
          </p>
        </section>
      </div>
    </DataBoundary>
    <SettingsSections
      screen="/admin/site-readiness"
      :heading="t('public-site.readiness.settings-heading')"
      :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
      @saved="refresh()"
    />
  </PageFrame>
</template>
