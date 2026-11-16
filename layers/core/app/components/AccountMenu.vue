<!-- The one component every shell renders, and so the only way between them (UI-02). It lists only
     the shells the viewer is entitled to; the current one is marked, not removed, so the menu does
     not rearrange as a person moves. An audience account sees three lines (My account, Appearance,
     Sign out) and never a locked or greyed members' or console entry: those are simply not in the
     page. A signed-out visitor sees Sign in. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { CHOSEN_KEY, MODE_COOKIE_AGE } from '../../shared/appearance'
import { shellOf } from '../../shared/navigation'

const { t } = useT()
const route = useRoute()
const { viewer, has } = useViewer()
const { signOut } = useSignOut()
const colorMode = useColorMode()
// Marks the mode as the person's own choice, where the server can read it (server/middleware/appearance.ts).
const chosen = useCookie<string | null>(CHOSEN_KEY, { path: '/', maxAge: MODE_COOKIE_AGE, sameSite: 'lax' })
const { data: publicSettings } = await usePublicSettings()
const mayChoose = computed(() => publicSettings.value['core.appearance.let-people-choose']?.value !== false)

// Which shell the person is in: the address says so.
const here = computed(() => shellOf(route.path) ?? 'public')

const items = computed<DropdownMenuItem[][]>(() => {
  const mark = (on: boolean): Partial<DropdownMenuItem> => on ? { trailingIcon: 'i-lucide-check', active: true, class: 'font-semibold' } : {}
  const where: DropdownMenuItem[] = [
    { label: t('core.menu.my-account'), icon: 'i-lucide-circle-user', to: '/account', ...mark(here.value === 'account') },
  ]
  if (has('members')) where.push({ label: viewer.value.membersName ?? t('core.menu.members'), icon: 'i-lucide-users', to: '/members', ...mark(here.value === 'members') })
  if (has('console')) where.push({ label: t('core.menu.console'), icon: 'i-lucide-layout-dashboard', to: '/console', ...mark(here.value === 'console') })

  if (has('admin')) where.push({ label: t('core.menu.admin'), icon: 'i-lucide-shield-check', to: '/admin', ...mark(here.value === 'admin') })

  const modes = (['system', 'light', 'dark'] as const).map(mode => ({
    label: t(`core.menu.appearance.${mode}`),
    type: 'checkbox' as const,
    checked: colorMode.preference === mode,
    onUpdateChecked: () => {
      colorMode.preference = mode
      chosen.value = '1'
    },
  }))
  return [
    where,
    ...(mayChoose.value ? [[{ label: t('core.menu.appearance'), icon: 'i-lucide-sun-moon', children: modes }]] : []),
    [{ label: t('core.menu.sign-out'), icon: 'i-lucide-log-out', onSelect: () => { void signOut() } }],
  ]
})
</script>

<template>
  <UDropdownMenu
    v-if="viewer.signedIn"
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-circle-user"
      trailing-icon="i-lucide-chevron-down"
      :label="viewer.name ?? t('core.menu.account')"
      :aria-label="t('core.menu.open', { name: viewer.name ?? t('core.menu.account') })"
    />
  </UDropdownMenu>
  <UButton
    v-else
    :to="{ path: '/sign-in', query: { next: route.fullPath } }"
    color="neutral"
    variant="outline"
    :label="t('core.menu.sign-in')"
  />
</template>
