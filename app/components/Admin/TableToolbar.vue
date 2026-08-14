<!--
  The row of controls above an admin table: filters on the left, actions on the
  right, wrapping to one column when there is no room.

  Deliberately not `UDashboardToolbar`, which looks like the obvious fit but is
  themed to sit flush under the navbar inside `UDashboardPanel`'s `#header` slot.
  The layout owns that slot; a page rendering one mid-body gets a stray full-
  width rule across its content.
-->
<template>
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex flex-1 flex-wrap items-center gap-3 min-w-0">
      <slot name="left" />
    </div>
    <div class="flex items-center gap-3">
      <slot name="right" />
    </div>
  </div>
</template>
