<!-- My account's overview (UI-02, UI-03): the same page for everyone signed in, beside the account's
     menu on a laptop (PageFrame). It greets the person, says what needs them (`core.account-notice`),
     and shows their life at the theatre as cards, one per `core.account-section` a module adds, each
     saying in a line how it stands. A section is shown only to those who hold its ability and, with
     hideEmpty, only while it has something to show; a module that is off leaves nothing behind.
     Below the cards, on a phone and a tablet, the account's own upkeep and any entry no card leads
     to are listed, standing in for the folded-away menu; from 1024 pixels the menu beside the page
     holds them, so the overview shows only the cards. -->
<script setup lang="ts">
import { ACCOUNT_GROUP_ORDER, type NavItem } from '../../../shared/navigation'

interface Me { signedIn: boolean, account?: { name: string | null, pronouns: string | null } }
interface Notice { key: string, tone: 'warning' | 'info', icon: string, title: string, description?: string, params?: Record<string, string>, to?: string, action?: string }

const { t } = useT()
const { data: me } = await useAPI<Me>('/api/core/me', { key: 'core:me' })
const { data: noticeData } = await useAPI<{ notices: Notice[] }>('/api/core/account-notices', { key: 'core:account-notices', default: () => ({ notices: [] }) })
const { data } = await useAPI<{ sections: { id: string, component: string, to?: string, icon?: string, count?: number }[] }>('/api/core/account-sections', { query: { side: 'audience' }, key: 'core:account-sections', default: () => ({ sections: [] }) })
const { data: navigation } = await useNavigation('account')

const { viewer } = useViewer()
const account = computed(() => me.value?.account)
const name = computed(() => account.value?.name ?? viewer.value.name ?? '')
const greeting = computed(() => name.value)
const who = computed(() => account.value?.pronouns || undefined)
// The passkey offer can be put away for a while; the cookie is the one "Not now" always set.
const PASSKEY_OFFER = 'core.passkey-offer:offer'
const LATER_DAYS = 90 // not-policy: how long "Not now" lasts in this browser
const later = useCookie(PASSKEY_LATER_COOKIE, { maxAge: LATER_DAYS * 24 * 60 * 60, sameSite: 'lax', path: '/' })
const notices = computed(() => noticeData.value.notices.filter(n => n.key !== PASSKEY_OFFER || !later.value))
function actionsOf(n: Notice) {
  const go = n.to && n.action ? [{ label: t(n.action), to: n.to, color: 'neutral' as const, variant: 'outline' as const }] : []
  if (n.key !== PASSKEY_OFFER) return go
  return [...go, { label: t('core.account.notices.not-now'), color: 'neutral' as const, variant: 'ghost' as const, onClick: () => { later.value = '1' } }]
}

// A name that no component answers to is left out rather than breaking the page.
const sections = computed(() => data.value.sections.flatMap((s) => {
  const component = resolveComponent(s.component)
  return typeof component === 'string' ? [] : [{ ...s, component }]
}))

// What the overview lists below the cards: every entry no card already leads to, by group.
const listed = computed(() => {
  const carded = new Set(sections.value.map(s => s.to).filter(Boolean))
  const entries = (navigation.value?.items ?? []).filter(e => !carded.has(e.to))
  return ACCOUNT_GROUP_ORDER
    .map(group => ({ group, entries: entries.filter((e: NavItem) => (e.group ?? 'theatre') === group) }))
    .filter(g => g.entries.length)
})
</script>

<template>
  <PageFrame
    :title="t('core.account.title')"
    :description="who"
  >
    <template #title>
      <span class="flex items-center gap-4">
        <UAvatar
          :alt="name"
          size="xl"
          aria-hidden="true"
        />
        <span>{{ greeting ? t('core.account.hello', { name: greeting }) : t('core.account.title') }}</span>
      </span>
    </template>
    <div class="space-y-10">
      <section
        v-if="notices.length"
        :aria-label="t('core.account.needs-you-label')"
        class="space-y-3"
      >
        <UAlert
          v-for="n in notices"
          :key="n.key"
          :color="n.tone"
          variant="subtle"
          :icon="n.icon"
          :title="t(n.title, n.params ?? {})"
          :description="n.description ? t(n.description, n.params ?? {}) : undefined"
          :actions="actionsOf(n)"
        />
      </section>

      <section
        v-if="sections.length"
        aria-labelledby="account-theatre"
        class="space-y-4"
      >
        <h2
          id="account-theatre"
          class="text-lg font-semibold text-highlighted"
        >
          {{ t('core.account.groups.theatre') }}
        </h2>
        <UPageGrid class="lg:grid-cols-2 xl:grid-cols-2">
          <component
            :is="s.component"
            v-for="s in sections"
            :key="s.id"
            :heading-id="`account-${s.id}`"
          />
        </UPageGrid>
      </section>

      <section
        v-for="g in listed"
        :key="g.group"
        :aria-labelledby="`account-list-${g.group}`"
        class="space-y-4 lg:hidden"
      >
        <h2
          :id="`account-list-${g.group}`"
          class="text-lg font-semibold text-highlighted"
        >
          {{ g.group === 'theatre' && sections.length ? t('core.account.more') : t(`core.account.groups.${g.group}`) }}
        </h2>
        <RecordList :label="t(`core.account.groups.${g.group}`)">
          <RecordListItem
            v-for="e in g.entries"
            :key="e.id"
            :to="e.to"
            :icon="e.icon"
            :name="t(e.label)"
          >
            <StatusBadge
              v-if="e.attention"
              tone="warning"
              :label="t('core.account.needs-you', { count: e.attention })"
            />
          </RecordListItem>
        </RecordList>
      </section>

      <EmptyState
        v-if="!sections.length && !navigation?.items.length && !notices.length"
        :title="t('core.account.empty')"
        :description="t('core.account.empty-description')"
      />
    </div>
  </PageFrame>
</template>
