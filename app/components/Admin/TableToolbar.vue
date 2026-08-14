<!--
  The row of controls above an admin table: filters on the left, actions on the
  right, wrapping to one column when there is no room.

  Deliberately not `UDashboardToolbar`, which looks like the obvious fit but is
  themed to sit flush under the navbar inside `UDashboardPanel`'s `#header` slot.
  The layout owns that slot; a page rendering one mid-body gets a stray full-
  width rule across its content.
-->
<template>
  <!--
    Stacks below `sm`, side by side above it.

    It used to be one `flex-wrap` row with a `flex-1 min-w-0` left group. Wrapping
    never happened, because both groups are single flex items: the left one just
    shrank, so on a phone a sentence of description became a one-word-per-line
    column with the action buttons sitting on top of it.
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
