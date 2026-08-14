<!--
  The root element of an admin page.

  Almost nothing: `UDashboardPanel`'s `#body` slot — which app/layouts/admin.vue
  renders every admin page into — already provides the padding, the scroll
  container and the vertical rhythm. The five different wrappers the pages had
  grown (`min-h-screen … p-6`, `p-6 space-y-8`, `space-y-8`, bare `flex flex-col
  gap-4`, `h-full overflow-hidden`) were all fighting it: doubling the padding,
  nesting a second scroll container inside an `overflow-y-auto` one, or dropping
  the padding entirely so the table ran into the panel edge.

  This exists only because eslint's `vue/no-multiple-template-root` requires a
  single root element. It re-states the panel's own rhythm so the page's children
  space themselves the same way, and takes `flex-1` so a footer bound with
  `mt-auto` still sits at the bottom on a short page.
-->
<template>
  <div class="flex flex-1 flex-col gap-4 sm:gap-6 min-h-0">
    <slot />
  </div>
</template>
