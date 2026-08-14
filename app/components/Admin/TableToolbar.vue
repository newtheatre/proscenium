<!--
The row of controls above an admin table: filters left, actions right.

Deliberately not `UDashboardToolbar`, which is themed to sit flush under the
navbar in the panel's `#header` slot — the layout owns that slot, and a page
rendering one mid-body gets a stray full-width rule across its content.
-->
<template>
  <!--
  Stacks below `sm`, side by side above it. One `flex-wrap` row never wraps
  here: both groups are single flex items, so the left one just shrinks and a
  sentence of description becomes one word per line on a phone.
  -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="flex flex-1 flex-wrap items-center gap-3 min-w-0">
      <slot name="left" />
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0">
      <slot name="right" />
    </div>
  </div>
</template>
