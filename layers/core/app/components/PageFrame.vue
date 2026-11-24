<!-- The frame every members' and console screen shares: one title (also the tab's title and the
     first heading), the page's one primary action, and one of three named content widths.

     In the console (and any shell built on Nuxt UI's dashboard) the page owns its panel: the title
     and primary action sit in the panel's navbar and stay put as the page scrolls, `toolbar` is the
     bar under it (a list's filters) and `footer` the bar at the foot (a form's buttons). In the
     public and members' shells the same slots sit in the page itself. Under /account the page sits
     beside My account's menu on a laptop, and its way back to the overview shows only on a phone,
     where the menu is folded away. -->
<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { shellOf } from '../../shared/navigation'

const props = withDefaults(defineProps<{
  title: string
  /** reading (forms, settings), standard (lists, records) or full (calendars, seating plans). */
  width?: 'reading' | 'standard' | 'full'
  description?: string
  /** The parents of this page, nearest last: where it sits below a navigation entry. Drawn here and nowhere else. */
  trail?: { label: string, to: string }[]
  /** A record's own name, which can be long: on a phone in the console it takes a line of its own under the bar, where the bar's actions cannot squeeze it. A page with a trail does so anyway. */
  longTitle?: boolean
}>(), { width: 'standard', description: undefined, trail: undefined, longTitle: false })

defineSlots<{
  default?: () => unknown
  /** Beside the title: the record's status. */
  status?: () => unknown
  /** One primary action per view. A second competing button is a sign the page does two jobs. */
  primary?: () => unknown
  /** In place of the title's words, inside the heading (My account's greeting). Phrasing content only. */
  title?: () => unknown
  toolbar?: () => unknown
  footer?: () => unknown
}>()

const embedded = inject(EMBEDDED_FRAME, false)
const window = inject(CONSOLE_WINDOW, false)
// In the console's settings window the page behind keeps its title.
if (!window) useHead({ title: () => props.title })
const { t } = useT()
// A link to a list returns it as it was left (the same view, filters, search, sort and page).
const { recall } = useListMemory()
const parents = computed(() => (props.trail ?? []).map(c => ({ label: c.label, to: recall(c.to), active: false })))
const nearest = computed(() => parents.value.at(-1))
// A failed load inside this page offers this as its way back.
provide('core:page-parent', nearest)
const dashboard = inject(DASHBOARD_SHELL, false)
const admin = inject(ADMIN_SHELL, false)
const widths = { reading: 'width-reading', standard: 'width-standard', full: 'width-full' } as const
const route = useRoute()
const account = computed(() => shellOf(route.path) === 'account')
// Beside the menu a page starts at the column's edge rather than centring in it.
const accountWidths = { reading: 'max-w-2xl', standard: 'max-w-5xl', full: '' } as const
// On a phone the navbar may grow a second line: when the title, status and actions do not fit
// together the actions drop below the title instead of squeezing it and the status out.
const navbarUi = {
  root: 'max-sm:h-auto max-sm:min-h-(--ui-header-height) max-sm:flex-wrap max-sm:py-2',
  left: 'max-sm:max-w-full',
  right: 'max-sm:ms-auto',
}
// On a phone a page below another has a back button in the bar too, so its title takes the line under it.
const titleBelow = computed(() => props.longTitle || !!nearest.value)
const [DefineBody, ReuseBody] = createReusableTemplate()
</script>

<template>
  <div
    v-if="embedded"
    class="space-y-4"
  >
    <div class="flex flex-wrap items-center gap-2">
      <IconButton
        v-if="nearest"
        :to="nearest.to"
        icon="i-lucide-chevron-left"
        :label="t('core.trail.back-to', { where: nearest.label })"
        class="-ms-2"
      />
      <h2 class="text-lg font-semibold text-highlighted">
        {{ title }}
      </h2>
      <slot name="status" />
      <div class="ms-auto flex items-center gap-2">
        <slot name="primary" />
      </div>
    </div>
    <p
      v-if="description"
      class="text-sm text-muted"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.toolbar"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="toolbar" />
    </div>
    <slot />
    <div
      v-if="$slots.footer"
      class="sticky-bar flex justify-end gap-2"
    >
      <slot name="footer" />
    </div>
  </div>

  <UDashboardPanel
    v-else-if="dashboard"
    :ui="{ root: 'h-svh' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="title"
        :ui="titleBelow ? { ...navbarUi, title: 'max-sm:sr-only' } : navbarUi"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBadge
            v-if="admin"
            icon="i-lucide-shield-check"
            :label="t('core.admin.mark')"
            color="neutral"
            variant="subtle"
            :ui="{ label: 'max-sm:sr-only' }"
          />
          <template v-if="nearest">
            <UBreadcrumb
              :items="parents"
              :aria-label="t('core.trail.label')"
              class="max-sm:hidden"
            />
            <UIcon
              name="i-lucide-chevron-right"
              aria-hidden="true"
              class="size-4 shrink-0 text-muted max-sm:hidden"
            />
            <IconButton
              :to="nearest.to"
              icon="i-lucide-chevron-left"
              class="sm:hidden"
              :label="t('core.trail.back-to', { where: nearest.label })"
            />
          </template>
        </template>
        <template #trailing>
          <slot name="status" />
        </template>
        <template #right>
          <slot name="primary" />
          <ShellTools />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar
        v-if="$slots.toolbar"
        :ui="{ root: 'max-sm:py-2' }"
      >
        <template #left>
          <slot name="toolbar" />
        </template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <div
        class="space-y-4"
        :class="widths[width]"
      >
        <!-- The heading stays in the bar for assistive technology; this line is what a phone shows. -->
        <div
          v-if="titleBelow"
          class="sm:hidden"
          aria-hidden="true"
        >
          <!-- The breadcrumb is a laptop's; on a phone the parent's name sits over the title. -->
          <p
            v-if="nearest"
            class="text-sm text-muted"
          >
            {{ nearest.label }}
          </p>
          <p class="text-lg font-semibold text-pretty text-highlighted">
            {{ title }}
          </p>
        </div>
        <p
          v-if="description"
          class="text-sm text-muted"
        >
          {{ description }}
        </p>
        <StrongerSignInNotice />
        <slot />
      </div>
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <div class="flex shrink-0 justify-end gap-2 border-t border-default px-4 py-3 sm:px-6">
        <slot name="footer" />
      </div>
    </template>
  </UDashboardPanel>

  <template v-else>
    <DefineBody>
      <UPageHeader
        :title="title"
        :description="description"
        :ui="{ root: 'max-sm:py-5', title: 'max-sm:text-2xl', description: 'max-sm:mt-2 max-sm:text-base', links: 'gap-2', wrapper: 'gap-3' }"
      >
        <template
          v-if="nearest"
          #headline
        >
          <UButton
            :to="nearest.to"
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="link"
            :label="nearest.label"
            :aria-label="t('core.trail.back-to', { where: nearest.label })"
            class="-ms-2.5"
            :class="account && 'lg:hidden'"
          />
        </template>
        <template
          v-if="$slots.title"
          #title
        >
          <slot name="title" />
        </template>
        <template #links>
          <slot name="primary" />
        </template>
        <div
          v-if="$slots.status"
          class="mt-3 flex flex-wrap items-center gap-2"
        >
          <slot name="status" />
        </div>
      </UPageHeader>
      <div class="space-y-4 py-6">
        <slot name="toolbar" />
        <slot />
        <div
          v-if="$slots.footer"
          class="sticky-bar flex justify-end gap-2"
        >
          <slot name="footer" />
        </div>
      </div>
    </DefineBody>
    <UContainer>
      <UPage v-if="account">
        <template #left>
          <UPageAside>
            <AccountNavigation />
          </UPageAside>
        </template>
        <div :class="accountWidths[width]">
          <ReuseBody />
        </div>
      </UPage>
      <div
        v-else
        :class="widths[width]"
      >
        <ReuseBody />
      </div>
    </UContainer>
  </template>
</template>
