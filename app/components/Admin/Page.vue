<!--
The root element of an admin page, and almost nothing else: the panel body
it renders into already provides the padding, the scroll container and the
vertical rhythm (ADR-0012).

It exists because eslint's `vue/no-multiple-template-root` requires a single
root. It restates the panel's rhythm so children space themselves the same
way, and takes `flex-1` so a footer bound with `mt-auto` sits at the bottom
on a short page.
-->
<template>
  <!--
  Two rules on the children, pulling in opposite directions on purpose.
  `min-w-0` lets them be narrower than their content, so a wide table scrolls
  itself rather than pushing the panel sideways. `shrink-0` stops them being
  shorter — this is a column flex container, and children otherwise shrink
  vertically and cut a two-line alert in half. The panel body scrolls, so
  overflowing it is correct.
  -->
  <div class="flex flex-1 flex-col gap-4 sm:gap-6 min-h-0 min-w-0 [&>*]:min-w-0 [&>*]:shrink-0">
    <slot />
  </div>
</template>
