<!--
Filters left, actions right. Deliberately not UDashboardToolbar, which is
themed for the panel's `#header` slot and draws a stray rule mid-body.
-->
<template>
  <!--
  Stacks below `sm`. One `flex-wrap` row never wraps: both groups are single
  flex items, so the left one just shrinks.
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
